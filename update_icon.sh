#!/bin/bash

APP_PATH="${2:-/Users/carlospereira/ciclo_total_app/Iniciar PAC.app}"
PNG_PATH="$1"
ICONSET_DIR="pac_icon.iconset"

if [ -z "$PNG_PATH" ]; then
    echo "Usage: $0 path/to/icon.png"
    exit 1
fi

echo "Ensuring source is a real PNG..."
sips -s format png "$PNG_PATH" --out "source.png" > /dev/null
PNG_PATH="source.png"

echo "Creating iconset..."
mkdir -p "$ICONSET_DIR"

sips -z 16 16     "$PNG_PATH" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null
sips -z 32 32     "$PNG_PATH" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null
sips -z 32 32     "$PNG_PATH" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null
sips -z 64 64     "$PNG_PATH" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null
sips -z 128 128   "$PNG_PATH" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null
sips -z 256 256   "$PNG_PATH" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null
sips -z 256 256   "$PNG_PATH" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null
sips -z 512 512   "$PNG_PATH" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null
sips -z 512 512   "$PNG_PATH" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null
sips -z 1024 1024 "$PNG_PATH" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null

echo "Converting to icns..."
iconutil -c icns "$ICONSET_DIR" -o "applet.icns"

echo "Applying icon to app..."
cp "applet.icns" "$APP_PATH/Contents/Resources/applet.icns"
touch "$APP_PATH"

echo "Cleaning up..."
rm -rf "$ICONSET_DIR"
rm "applet.icns"
rm "source.png"

echo "Done! The icon has been updated."
