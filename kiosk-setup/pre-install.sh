#!/bin/bash
set -e

echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y \
  libudev-dev \
  libusb-1.0-0-dev \
  alsa-utils \
  xserver-xorg \
  xinit \
  unclutter \
  libnss3 \
  libxss1 \
  libasound2 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgtk-3-0 \
  libgbm1 \
  libatk-bridge2.0-0 \
  libxkbcommon0 \
  x11-utils \
  fonts-liberation \
  xdg-utils

echo "🧩 Setting up udev rules for HID access..."
cat <<EOF | sudo tee /etc/udev/rules.d/99-hidraw.rules
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", MODE="0666"
EOF
sudo udevadm control --reload
sudo udevadm trigger

echo "🚀 Creating autostart entry..."
mkdir -p ~/.config/autostart
cat <<EOF > ~/.config/autostart/guestbook.desktop
[Desktop Entry]
Type=Application
Exec=/home/\$USER/wolfpackGuestbook/dist/wolfpack-guestbook --no-sandbox
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Wolfpack Guestbook
Comment=Autostarts the guestbook kiosk app
EOF

echo "🧹 Enabling unclutter (auto-hide mouse)..."
if ! grep -q 'unclutter &' ~/.xinitrc 2>/dev/null; then
  echo 'unclutter &' >> ~/.xinitrc
fi

echo "✅ Setup complete. You may now reboot and test the app launch."
