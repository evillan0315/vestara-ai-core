#!/usr/bin/env bash
set -Eeuo pipefail

# Build a UEFI-bootable image file. It never writes directly to a block device.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUTPUT=${VESTARA_IMAGE_OUTPUT:-${ROOT}/vestara.img}
OUTPUT_NAME=$(basename -- "$OUTPUT")
SUITE=${VESTARA_IMAGE_SUITE:-trixie}
MIRROR=${VESTARA_IMAGE_MIRROR:-https://deb.debian.org/debian}
SIZE=${VESTARA_IMAGE_SIZE:-16G}
# Host-persistent download cache (apt archives + npm cache). Survives
# --force rebuilds so only changed packages are re-downloaded. Export empty
# to disable: VESTARA_IMAGE_CACHE_DIR=.
CACHE_DIR=${VESTARA_IMAGE_CACHE_DIR:-${ROOT}/.cache/vestara-image}
FORCE=0
usage() { cat >&2 <<'USAGE'
Usage: sudo scripts/build-vestara-image.sh [--output PATH] [--suite NAME] [--mirror URL] [--size SIZE] [--force]

Environment:
  VESTARA_IMAGE_OUTPUT / SUITE / MIRROR / SIZE (defaults above)
  VESTARA_IMAGE_CACHE_DIR  host download cache (default
                           <repo>/.cache/vestara-image, gitignored; empty disables)
USAGE
}
while (($#)); do
  case $1 in
    --) shift;;
    --output) OUTPUT=${2:?missing value for --output}; shift 2;;
    --suite) SUITE=${2:?missing value for --suite}; shift 2;;
    --mirror) MIRROR=${2:?missing value for --mirror}; shift 2;;
    --size) SIZE=${2:?missing value for --size}; shift 2;;
    --force) FORCE=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown option: $1" >&2; usage; exit 2;;
  esac
done
if [[ ${EUID} -ne 0 ]]; then echo 'Run this builder with sudo.' >&2; exit 1; fi
case $OUTPUT in /dev/*|/sys/*|/proc/*|/) echo "Refusing unsafe output path: $OUTPUT" >&2; exit 1;; esac
if [[ -e $OUTPUT && $FORCE -ne 1 ]]; then echo "Output exists; use --force: $OUTPUT" >&2; exit 1; fi
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
for command in debootstrap parted losetup mkfs.fat mkfs.ext4 mount umount chroot grub-install rsync lsinitramfs curl gpg; do need "$command"; done
for artifact in "$ROOT/apps/api/dist/index.js" "$ROOT/apps/cli/dist/index.js"; do
  [[ -f $artifact ]] || { echo "Missing build artifact: $artifact; run pnpm build first." >&2; exit 1; }
done
WORK=$(mktemp -d /tmp/vestara-image.XXXXXX); LOOP=''
cleanup() { set +e; for mountpoint in "$WORK/root/var/cache/apt/archives" "$WORK/root/var/cache/npm" "$WORK/root/run" "$WORK/root/sys" "$WORK/root/proc" "$WORK/root/dev" "$WORK/esp" "$WORK/root"; do mountpoint -q "$mountpoint" && umount -lf "$mountpoint"; done; [[ -n $LOOP ]] && losetup --detach "$LOOP" >/dev/null 2>&1; rm -rf "$WORK"; [[ -n ${SUDO_USER:-} && -n ${CACHE_DIR:-} && -d $CACHE_DIR ]] && chown -R "$SUDO_USER" "$CACHE_DIR"; }
trap cleanup EXIT
mkdir -p "$(dirname "$OUTPUT")"
truncate -s "$SIZE" "$OUTPUT"
parted "$OUTPUT" --script mklabel gpt mkpart ESP fat32 1MiB 513MiB set 1 esp on mkpart root ext4 513MiB 100%
LOOP=$(losetup --find --show --partscan "$OUTPUT")
for _ in {1..20}; do [[ -b ${LOOP}p1 && -b ${LOOP}p2 ]] && break; sleep 0.2; done
[[ -b ${LOOP}p1 && -b ${LOOP}p2 ]] || { echo 'Partition devices did not appear.' >&2; exit 1; }
mkfs.fat -F32 "${LOOP}p1"; mkfs.ext4 -F "${LOOP}p2"
mkdir -p "$WORK/root" "$WORK/esp"; mount "${LOOP}p2" "$WORK/root"; mount "${LOOP}p1" "$WORK/esp"
# Bind the host download cache into the target before anything downloads, so
# debootstrap/apt/npm reuse prior runs. The mounts also keep the image lean:
# cached payloads live on the host, not in the image filesystem.
if [[ -n $CACHE_DIR ]]; then
  mkdir -p "$CACHE_DIR/apt-archives" "$CACHE_DIR/npm"
  mkdir -p "$WORK/root/var/cache/apt/archives" "$WORK/root/var/cache/npm"
  mount --bind "$CACHE_DIR/apt-archives" "$WORK/root/var/cache/apt/archives"
  mount --bind "$CACHE_DIR/npm" "$WORK/root/var/cache/npm"
fi
mkdir -p "$WORK/bin"
cat > "$WORK/bin/wget" <<'WGET'
#!/bin/sh
exec /usr/bin/wget --timeout=30 --tries=3 --waitretry=5 "$@"
WGET
chmod 755 "$WORK/bin/wget"
PATH="$WORK/bin:$PATH" debootstrap --variant=minbase --include=apt,apt-utils "$SUITE" "$WORK/root" "$MIRROR"
install -d -m 0755 "$WORK/root/etc/apt/sources.list.d"
cat > "$WORK/root/etc/apt/sources.list.d/vestara-components.list" <<APT
deb $MIRROR $SUITE main contrib non-free non-free-firmware
APT
install -d -m 0755 "$WORK/root/dev" "$WORK/root/proc" "$WORK/root/sys" "$WORK/root/run"
cp -L /etc/resolv.conf "$WORK/root/etc/resolv.conf.vestara"
mount --bind /dev "$WORK/root/dev"; mount -t proc proc "$WORK/root/proc"; mount -t sysfs sysfs "$WORK/root/sys"; mount --bind /run "$WORK/root/run"
rm -f "$WORK/root/etc/resolv.conf"; mv "$WORK/root/etc/resolv.conf.vestara" "$WORK/root/etc/resolv.conf"
install -d -m 0755 "$WORK/root/usr/sbin"
cat > "$WORK/root/usr/sbin/policy-rc.d" <<'POLICY'
#!/bin/sh
exit 101
POLICY
chmod 755 "$WORK/root/usr/sbin/policy-rc.d"
chroot "$WORK/root" /usr/bin/apt-get update
#chroot "$WORK/root" env DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get install -y linux-image-amd64 grub-efi-amd64-signed shim-signed systemd-sysv plymouth plymouth-themes librsvg2-bin ca-certificates nodejs rsync
# VOS runtime: Debian trixie ships Node 20, but the repo requires Node 22+
# (node:sqlite needs >=22.5 — the API exits on Node 20). Install Node 24
# from NodeSource; its nodejs package provides npm, so the distro npm
# package (which conflicts with it) is intentionally absent below.
install -d -m 0755 "$WORK/root/usr/share/keyrings"
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o "$WORK/root/usr/share/keyrings/nodesource.gpg"
chmod 0644 "$WORK/root/usr/share/keyrings/nodesource.gpg"
cat > "$WORK/root/etc/apt/sources.list.d/nodesource.list" <<'APT'
deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main
APT
chroot "$WORK/root" /usr/bin/apt-get update
chroot "$WORK/root" env DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get install -y linux-image-amd64 grub-efi-amd64-signed shim-signed systemd-sysv plymouth plymouth-themes librsvg2-bin ca-certificates nodejs rsync xserver-xorg lightdm lightdm-gtk-greeter xfce4 xfce4-terminal chromium curl
NODE_VERSION=$(chroot "$WORK/root" /usr/bin/node --version)
[[ $NODE_VERSION == v24.* ]] || { echo "Expected Node 24 on image, got: $NODE_VERSION" >&2; exit 1; }
chroot "$WORK/root" /usr/bin/npm --version
chroot "$WORK/root" groupadd --system vestara || true; chroot "$WORK/root" useradd --system --gid vestara --home-dir /var/lib/vestara --shell /usr/sbin/nologin vestara || true
chroot "$WORK/root" useradd --create-home --shell /bin/bash eddie || true
chroot "$WORK/root" usermod -aG sudo eddie || true
printf '%s\n' 'eddie:vestara' | chroot "$WORK/root" chpasswd

# Install external coding-agent CLIs (OpenAI Codex, Claude Code, Gemini CLI)
# as global npm packages so external-runtime discovery finds them on the image.
chroot "$WORK/root" env DEBIAN_FRONTEND=noninteractive NPM_CONFIG_CACHE=/var/cache/npm /usr/bin/npm install -g @openai/codex @anthropic-ai/claude-code @google/gemini-cli

rsync -a --delete --exclude '.git/' --exclude '.env' --exclude "$OUTPUT_NAME" "$ROOT/" "$WORK/root/opt/vestara/"
chroot "$WORK/root" install -d -o vestara -g vestara -m 0750 /opt/vestara/.vestara
install -d -m 0755 "$WORK/root/etc/systemd/system" "$WORK/root/etc/systemd/system/vestara.target.wants" "$WORK/root/etc/systemd/system/multi-user.target.wants"
install -d -m 0755 "$WORK/root/boot/efi"
install -d -m 0755 "$WORK/root/boot/grub/themes/vestara" "$WORK/root/usr/share/plymouth/themes/vestara" "$WORK/root/etc/default/grub.d"
install -m 0644 "$ROOT"/os/customization/grub/theme.txt "$WORK/root/boot/grub/themes/vestara/theme.txt"
install -m 0644 "$ROOT"/os/customization/plymouth/background.png "$WORK/root/boot/grub/vestara-background.png"
install -m 0644 "$ROOT"/os/customization/plymouth/vestara.plymouth "$ROOT"/os/customization/plymouth/vestara.script "$WORK/root/usr/share/plymouth/themes/vestara/"
install -m 0644 "$ROOT"/os/customization/plymouth/background.png "$WORK/root/usr/share/plymouth/themes/vestara/"
for frame in "$ROOT"/os/customization/plymouth/throbber-*.png; do
  [[ -f $frame ]] || { echo "Missing Plymouth throbber frame: $frame" >&2; exit 1; }
  install -m 0644 "$frame" "$WORK/root/usr/share/plymouth/themes/vestara/"
done
[[ $(find "$ROOT/os/customization/plymouth" -maxdepth 1 -name 'throbber-*.png' | wc -l) -eq 20 ]] || {
  echo "Expected exactly 20 Plymouth throbber frames." >&2
  exit 1
}
install -m 0644 "$ROOT"/os/customization/configs/grub/vestara.cfg "$WORK/root/etc/default/grub.d/vestara.cfg"
install -m 0644 "$ROOT"/os/customization/assets/logo.svg "$WORK/root/usr/share/plymouth/themes/vestara/logo.svg"
chroot "$WORK/root" rsvg-convert --width 512 --height 512 --output /usr/share/plymouth/themes/vestara/logo.png /usr/share/plymouth/themes/vestara/logo.svg
install -m 0644 "$WORK/root/usr/share/plymouth/themes/vestara/logo.png" "$WORK/root/boot/grub/themes/vestara/logo.png"
install -d -m 0755 "$WORK/root/etc/plymouth"
cat > "$WORK/root/etc/plymouth/plymouthd.conf" <<'PLYMOUTH'
[Daemon]
Theme=vestara
PLYMOUTH
# Debian's package defaults can otherwise leave default.plymouth pointing at
# the distro spinner. Make Vestara the package-level default as well as the
# daemon configuration, then rebuild initramfs after all assets are present.
ln -sfn vestara.plymouth "$WORK/root/usr/share/plymouth/themes/default.plymouth"
install -m 0644 "$ROOT"/os/systemd/*.service "$ROOT"/os/systemd/*.path "$ROOT"/os/systemd/vestara.target "$WORK/root/etc/systemd/system/"
for service in vestara-host.service vestara-api.service vestara-workspace.service; do ln -sfn "../$service" "$WORK/root/etc/systemd/system/vestara.target.wants/$service"; done
ln -sfn ../vestara.target "$WORK/root/etc/systemd/system/multi-user.target.wants/vestara.target"
install -d -m 0755 "$WORK/root/var/lib/vestara/workspaces" "$WORK/root/etc/vestara"
# VOS-STARTUP-001 P3: onboarding marker dir — writable by the API user
# (POST /api/onboarding/begin|complete), readable by the desktop user.
chroot "$WORK/root" install -d -o vestara -g vestara -m 0755 /var/lib/vestara/onboarding
install -m 0644 "$ROOT/os/customization/identity/eddie.yaml" "$WORK/root/etc/vestara/human-profile.yaml"
# VOS-STARTUP-001 P3: LightDM seat + greeter config and the XFCE session
# autostart bridge live under os/customization/login/ (single source).
for login_file in 50-vestara-seat.conf lightdm-gtk-greeter.conf vestara-startup-session.sh vestara-startup.desktop; do
  [[ -f $ROOT/os/customization/login/$login_file ]] || { echo "Missing login bridge file: $login_file" >&2; exit 1; }
done
install -d -m 0755 "$WORK/root/etc/lightdm/lightdm.conf.d"
install -m 0644 "$ROOT/os/customization/login/50-vestara-seat.conf" "$WORK/root/etc/lightdm/lightdm.conf.d/50-vestara.conf"
install -m 0644 "$ROOT/os/customization/login/lightdm-gtk-greeter.conf" "$WORK/root/etc/lightdm/lightdm-gtk-greeter.conf"
install -m 0755 "$ROOT/os/customization/login/vestara-startup-session.sh" "$WORK/root/usr/local/bin/vestara-startup-session.sh"
install -d -m 0755 "$WORK/root/etc/xdg/autostart"
install -m 0644 "$ROOT/os/customization/login/vestara-startup.desktop" "$WORK/root/etc/xdg/autostart/vestara-startup.desktop"
[[ -x $WORK/root/usr/bin/chromium ]] || { echo 'chromium is not installed on the image.' >&2; exit 1; }
[[ -x $WORK/root/usr/bin/curl ]] || { echo 'curl is not installed on the image.' >&2; exit 1; }
printf '%s\n' /usr/sbin/lightdm > "$WORK/root/etc/X11/default-display-manager"
printf '%s\n' 'VESTARA_REPO=/var/lib/vestara/workspaces/default' > "$WORK/root/etc/vestara/vestara.env"
printf '%s\n' 'VESTARA_ONBOARDING_MARKER_DIR=/var/lib/vestara/onboarding' >> "$WORK/root/etc/vestara/vestara.env"
chroot "$WORK/root" systemctl enable vestara.target vestara-host.service vestara-api.service vestara-workspace.service vestara-api-reload.path lightdm.service
chroot "$WORK/root" systemctl set-default graphical.target
chroot "$WORK/root" rm -f /usr/sbin/policy-rc.d
ROOT_UUID=$(blkid -s UUID -o value "${LOOP}p2"); ESP_UUID=$(blkid -s UUID -o value "${LOOP}p1")
cat > "$WORK/root/etc/fstab" <<FSTAB
UUID=$ROOT_UUID / ext4 defaults 0 1
UUID=$ESP_UUID /boot/efi vfat umask=0077 0 1
FSTAB
printf '%s\n' "GRUB_DEVICE_UUID=$ROOT_UUID" > "$WORK/root/etc/default/grub.d/vestara-root.cfg"
install -d -m 0755 "$WORK/root/dev/disk/by-uuid"
ln -sfn "${LOOP}p2" "$WORK/root/dev/disk/by-uuid/$ROOT_UUID"
chroot "$WORK/root" update-grub
grep -Fq "$ROOT_UUID" "$WORK/root/boot/grub/grub.cfg" || {
  echo "GRUB configuration does not reference the image root UUID: $ROOT_UUID" >&2
  exit 1
}
grub-install --target=x86_64-efi --efi-directory="$WORK/esp" --boot-directory="$WORK/root/boot" --root-directory="$WORK/root" --removable --no-nvram
[[ -f "$WORK/esp/EFI/BOOT/BOOTX64.EFI" ]] || {
  echo "EFI bootloader was not created." >&2
  find "$WORK/esp" -maxdepth 4 -print >&2
  exit 1
}
chroot "$WORK/root" update-initramfs -u -k all
for initrd in "$WORK/root"/boot/initrd.img-*; do
  [[ -f $initrd ]] || continue
  lsinitramfs "$initrd" | grep -Fq 'usr/share/plymouth/themes/vestara/vestara.plymouth' || {
    echo "Vestara Plymouth theme is missing from initramfs: $initrd" >&2
    exit 1
  }
  lsinitramfs "$initrd" | grep -Fq 'usr/share/plymouth/themes/vestara/throbber-19.png' || {
    echo "Vestara Plymouth throbber is missing from initramfs: $initrd" >&2
    exit 1
  }
done
echo "Created UEFI-bootable image: $OUTPUT"
