#!/usr/bin/env bash
set -Eeuo pipefail

# Build a UEFI-bootable image file. It never writes directly to a block device.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUTPUT=${VESTARA_IMAGE_OUTPUT:-${ROOT}/vestara.img}
SUITE=${VESTARA_IMAGE_SUITE:-noble}
MIRROR=${VESTARA_IMAGE_MIRROR:-https://archive.ubuntu.com/ubuntu}
SIZE=${VESTARA_IMAGE_SIZE:-16G}
FORCE=0
usage() { cat >&2 <<'USAGE'
Usage: sudo scripts/build-vestara-image.sh [--output PATH] [--suite NAME] [--mirror URL] [--size SIZE] [--force]
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
for command in debootstrap parted losetup mkfs.fat mkfs.ext4 mount umount chroot grub-install rsync; do need "$command"; done
for artifact in "$ROOT/apps/api/dist/index.js" "$ROOT/apps/cli/dist/index.js"; do
  [[ -f $artifact ]] || { echo "Missing build artifact: $artifact; run pnpm build first." >&2; exit 1; }
done
WORK=$(mktemp -d /tmp/vestara-image.XXXXXX); LOOP=''
cleanup() { set +e; for mountpoint in "$WORK/root/run" "$WORK/root/sys" "$WORK/root/proc" "$WORK/root/dev" "$WORK/esp" "$WORK/root"; do mountpoint -q "$mountpoint" && umount -lf "$mountpoint"; done; [[ -n $LOOP ]] && losetup --detach "$LOOP" >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT
mkdir -p "$(dirname "$OUTPUT")"
truncate -s "$SIZE" "$OUTPUT"
parted "$OUTPUT" --script mklabel gpt mkpart ESP fat32 1MiB 513MiB set 1 esp on mkpart root ext4 513MiB 100%
LOOP=$(losetup --find --show --partscan "$OUTPUT")
for _ in {1..20}; do [[ -b ${LOOP}p1 && -b ${LOOP}p2 ]] && break; sleep 0.2; done
[[ -b ${LOOP}p1 && -b ${LOOP}p2 ]] || { echo 'Partition devices did not appear.' >&2; exit 1; }
mkfs.fat -F32 "${LOOP}p1"; mkfs.ext4 -F "${LOOP}p2"
mkdir -p "$WORK/root" "$WORK/esp"; mount "${LOOP}p2" "$WORK/root"; mount "${LOOP}p1" "$WORK/esp"
mkdir -p "$WORK/bin"
cat > "$WORK/bin/wget" <<'WGET'
#!/bin/sh
exec /usr/bin/wget --timeout=30 --tries=3 --waitretry=5 "$@"
WGET
chmod 755 "$WORK/bin/wget"
PATH="$WORK/bin:$PATH" debootstrap --variant=minbase --include=apt,apt-utils "$SUITE" "$WORK/root" "$MIRROR"
install -d -m 0755 "$WORK/root/etc/apt/sources.list.d"
cat > "$WORK/root/etc/apt/sources.list.d/vestara-universe.list" <<APT
deb $MIRROR $SUITE main universe
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
chroot "$WORK/root" env DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get install -y linux-image-generic grub-efi-amd64-signed shim-signed systemd-sysv plymouth plymouth-themes librsvg2-bin ca-certificates nodejs rsync
chroot "$WORK/root" groupadd --system vestara || true; chroot "$WORK/root" useradd --system --gid vestara --home-dir /var/lib/vestara --shell /usr/sbin/nologin vestara || true

# Install external coding-agent CLIs (OpenAI Codex, Claude Code, Gemini CLI)
# as global npm packages so external-runtime discovery finds them on the image.
chroot "$WORK/root" env DEBIAN_FRONTEND=noninteractive /usr/bin/npm install -g @openai/codex @anthropic-ai/claude-code @google/gemini-cli

rsync -a --delete --exclude '.git/' --exclude '.env' "$ROOT/" "$WORK/root/opt/vestara/"
chroot "$WORK/root" install -d -o vestara -g vestara -m 0750 /opt/vestara/.vestara
install -d -m 0755 "$WORK/root/etc/systemd/system" "$WORK/root/etc/systemd/system/vestara.target.wants" "$WORK/root/etc/systemd/system/multi-user.target.wants"
install -d -m 0755 "$WORK/root/boot/efi"
install -d -m 0755 "$WORK/root/boot/grub/themes/vestara" "$WORK/root/usr/share/plymouth/themes/vestara" "$WORK/root/etc/default/grub.d"
install -m 0644 "$ROOT"/os/customization/grub/theme.txt "$WORK/root/boot/grub/themes/vestara/theme.txt"
install -m 0644 "$ROOT"/os/customization/plymouth/vestara.plymouth "$ROOT"/os/customization/plymouth/vestara.script "$WORK/root/usr/share/plymouth/themes/vestara/"
install -m 0644 "$ROOT"/os/customization/configs/grub/vestara.cfg "$WORK/root/etc/default/grub.d/vestara.cfg"
install -m 0644 "$ROOT"/os/customization/assets/logo.svg "$WORK/root/usr/share/plymouth/themes/vestara/logo.svg"
chroot "$WORK/root" rsvg-convert --width 512 --height 512 --output /usr/share/plymouth/themes/vestara/logo.png /usr/share/plymouth/themes/vestara/logo.svg
install -m 0644 "$WORK/root/usr/share/plymouth/themes/vestara/logo.png" "$WORK/root/boot/grub/themes/vestara/logo.png"
chroot "$WORK/root" plymouth-set-default-theme -R vestara
install -m 0644 "$ROOT"/os/systemd/*.service "$ROOT"/os/systemd/*.path "$ROOT"/os/systemd/vestara.target "$WORK/root/etc/systemd/system/"
for service in vestara-host.service vestara-api.service vestara-workspace.service; do ln -sfn "../$service" "$WORK/root/etc/systemd/system/vestara.target.wants/$service"; done
ln -sfn ../vestara.target "$WORK/root/etc/systemd/system/multi-user.target.wants/vestara.target"
install -d -m 0755 "$WORK/root/var/lib/vestara/workspaces" "$WORK/root/etc/vestara"
chroot "$WORK/root" update-grub
printf '%s\n' 'VESTARA_REPO=/var/lib/vestara/workspaces/default' > "$WORK/root/etc/vestara/vestara.env"
chroot "$WORK/root" systemctl enable vestara.target vestara-host.service vestara-api.service vestara-workspace.service vestara-api-reload.path; chroot "$WORK/root" rm -f /usr/sbin/policy-rc.d
ROOT_UUID=$(blkid -s UUID -o value "${LOOP}p2"); ESP_UUID=$(blkid -s UUID -o value "${LOOP}p1")
cat > "$WORK/root/etc/fstab" <<FSTAB
UUID=$ROOT_UUID / ext4 defaults 0 1
UUID=$ESP_UUID /boot/efi vfat umask=0077 0 1
FSTAB
grub-install --target=x86_64-efi --efi-directory="$WORK/esp" --boot-directory="$WORK/root/boot" --root-directory="$WORK/root" --removable --no-nvram
chroot "$WORK/root" update-initramfs -c -k all || true
echo "Created UEFI-bootable image: $OUTPUT"
