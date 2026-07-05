#!/bin/bash
set -euo pipefail

# Release GoProfiler to Homebrew tap
# Usage: ./scripts/release-brew.sh <tag>
# Example: ./scripts/release-brew.sh v0.1.0

TAG="${1:-}"
if [ -z "$TAG" ]; then
    echo "Usage: $0 <tag>"
    echo "Example: $0 v0.1.0"
    exit 1
fi

APP_NAME="GoProfiler"
APP_PATH="build/bin/${APP_NAME}.app"
ZIP_NAME="${APP_NAME}-${TAG}.zip"
ZIP_PATH="build/brew/${ZIP_NAME}"
GITHUB_REPO="philipparndt/goprofiler"
HOMEBREW_TAP_REPO="philipparndt/homebrew-goprofiler"

# Verify TAG matches productVersion in wails.json
PROJECT_VERSION=$(grep -m1 '"productVersion"' wails.json | sed 's/.*: *"\(.*\)".*/\1/')
TAG_VERSION="${TAG#v}"

if [ "${TAG_VERSION}" != "${PROJECT_VERSION}" ]; then
    echo "ERROR: Tag version (${TAG_VERSION}) does not match productVersion in wails.json (${PROJECT_VERSION})"
    echo "Bump the version first with make bump-major/bump-minor/bump-patch."
    exit 1
fi
echo "Version check passed: ${TAG_VERSION} matches wails.json productVersion"

CODESIGN_IDENTITY=$(security find-identity -v -p codesigning | grep -o '"Developer ID Application[^"]*"' | head -1 | tr -d '"')
if [ -z "${CODESIGN_IDENTITY}" ]; then
    echo "ERROR: No 'Developer ID Application' signing identity found."
    exit 1
fi

echo "=== Releasing ${APP_NAME} ${TAG} to Homebrew ==="

# Step 1: Clean build directory
echo ""
echo "--- Cleaning build directory ---"
rm -rf build/brew
mkdir -p build/brew

# Step 2: Build the app
echo ""
echo "--- Building ${APP_NAME} ---"
make build-desktop

# Step 3: Sign for distribution (hardened runtime + timestamp, required for notarization)
echo ""
echo "--- Signing with ${CODESIGN_IDENTITY} ---"
codesign --force --deep --timestamp --options runtime \
    --sign "${CODESIGN_IDENTITY}" "${APP_PATH}"
codesign --verify --strict "${APP_PATH}"

# Step 4: Notarize
echo ""
echo "--- Notarizing ---"
ZIP_FOR_NOTARIZATION="build/brew/${APP_NAME}-notarize.zip"
ditto -c -k --keepParent "${APP_PATH}" "${ZIP_FOR_NOTARIZATION}"

NOTARY_OUTPUT=$(xcrun notarytool submit "${ZIP_FOR_NOTARIZATION}" \
    --keychain-profile "notarytool" \
    --wait 2>&1)
echo "${NOTARY_OUTPUT}"

if echo "${NOTARY_OUTPUT}" | grep -q "status: Invalid"; then
    SUBMISSION_ID=$(echo "${NOTARY_OUTPUT}" | grep "id:" | head -1 | awk '{print $2}')
    echo "Notarization failed. Fetching log..."
    xcrun notarytool log "${SUBMISSION_ID}" --keychain-profile "notarytool"
    exit 1
fi

# Step 5: Staple the notarization ticket
echo ""
echo "--- Stapling notarization ticket ---"
xcrun stapler staple "${APP_PATH}"

# Step 6: Create final ZIP for distribution
echo ""
echo "--- Creating distribution ZIP ---"
ditto -c -k --keepParent "${APP_PATH}" "${ZIP_PATH}"

SHA256=$(shasum -a 256 "${ZIP_PATH}" | awk '{print $1}')
echo "SHA256: ${SHA256}"

# Step 7: Create GitHub release
echo ""
echo "--- Creating GitHub release ${TAG} ---"
gh release create "${TAG}" "${ZIP_PATH}" \
    --repo "${GITHUB_REPO}" \
    --title "${APP_NAME} ${TAG}" \
    --generate-notes

DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${TAG}/${ZIP_NAME}"
echo "Download URL: ${DOWNLOAD_URL}"

# Step 8: Update Homebrew cask formula
echo ""
echo "--- Updating Homebrew cask formula ---"

CASK_CONTENT="cask \"goprofiler\" do
  version \"${TAG#v}\"
  sha256 \"${SHA256}\"

  url \"https://github.com/${GITHUB_REPO}/releases/download/v#{version}/${APP_NAME}-v#{version}.zip\"
  name \"GoProfiler\"
  desc \"Profiling UI for Go and Java applications\"
  homepage \"https://github.com/${GITHUB_REPO}\"

  depends_on macos: :ventura

  app \"${APP_NAME}.app\"

  zap trash: [
    \"~/.goprofiler\",
    \"~/.config/goprofiler\",
  ]
end
"

HOMEBREW_TAP_DIR=$(mktemp -d)
echo "Cloning Homebrew tap to ${HOMEBREW_TAP_DIR}..."
gh repo clone "${HOMEBREW_TAP_REPO}" "${HOMEBREW_TAP_DIR}"

mkdir -p "${HOMEBREW_TAP_DIR}/Casks"
echo "${CASK_CONTENT}" > "${HOMEBREW_TAP_DIR}/Casks/goprofiler.rb"

pushd "${HOMEBREW_TAP_DIR}" > /dev/null
git add Casks/goprofiler.rb
git commit -m "Update goprofiler to ${TAG}"
# HEAD:main also works on a fresh clone of an empty repository
git push -u origin HEAD:main
popd > /dev/null

rm -rf "${HOMEBREW_TAP_DIR}"

echo ""
echo "=== Release complete ==="
echo "Install with: brew install philipparndt/goprofiler/goprofiler"
echo "Or: brew tap philipparndt/goprofiler && brew install --cask goprofiler"
