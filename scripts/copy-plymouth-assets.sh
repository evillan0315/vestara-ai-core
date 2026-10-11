#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SOURCE_DIR=${VESTARA_ROTATING_DIR:-"${HOME}/vestara-debian-live/vestara-rotating"}
DEST_DIR="${ROOT}/os/customization/plymouth"

if [[ ! -d ${SOURCE_DIR} ]]; then
  echo "Source directory not found: ${SOURCE_DIR}" >&2
  echo "Set VESTARA_ROTATING_DIR if the assets are elsewhere." >&2
  exit 1
fi

required_files=("${SOURCE_DIR}/background.png")
for index in $(seq -w 0 15); do
  required_files+=("${SOURCE_DIR}/v-rotate-${index}.png")
done

for file in "${required_files[@]}"; do
  if [[ ! -f ${file} ]]; then
    echo "Required Plymouth asset not found: ${file}" >&2
    exit 1
  fi
done

install -d -m 0755 "${DEST_DIR}"
install -m 0644 "${SOURCE_DIR}/background.png" "${DEST_DIR}/background.png"

for index in $(seq -w 0 15); do
  install -m 0644 \
    "${SOURCE_DIR}/v-rotate-${index}.png" \
    "${DEST_DIR}/v-rotate-${index}.png"
done

echo "Copied Plymouth assets to: ${DEST_DIR}"
echo "Installed background.png and 16 rotating logo frames."
