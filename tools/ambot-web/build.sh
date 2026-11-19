#!/usr/bin/env bash
# Builds the browser version of AMBOT for the portfolio (played through CheerpJ).
#
#   tools/ambot-web/build.sh ["/path/to/AMBOT (OOP2)"]
#
# The AMBOT repository itself is never modified. This script copies its source to a
# temporary folder and makes two browser-only changes there:
#   1. sound goes through ambot.web.WebAudio (the page plays it), because CheerpJ
#      has no javax.sound mixers;
#   2. the game starts in its borderless fullscreen mode, so it fills the player box;
#   3. frames scale by any factor (ambot.web.WebFit), not only whole numbers, so
#      there are no black bars around the game;
#   4. Quit pauses the game behind the page's "Play again" cover (ambot.web.WebSession)
#      instead of ending the Java runtime, so it can be played again without a reload.
# It then compiles for Java 17 (the newest version CheerpJ runs reliably) and writes:
#   src/games/ambot/ambot.jar       the game
#   src/games/ambot/audio/...       the WAV files the page plays
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$(cd "$HERE/../.." && pwd)"
AMBOT="${1:-$SITE/../Project Restorations/AMBOT (OOP2)}"
JDK="${AMBOT_JDK:-/c/jdk-26}"
OUT="$SITE/src/games/ambot"

[ -d "$AMBOT/src/ambot" ] || { echo "AMBOT source not found at: $AMBOT" >&2; exit 1; }
[ -x "$JDK/bin/javac.exe" ] || [ -x "$JDK/bin/javac" ] || { echo "No JDK at $JDK (set AMBOT_JDK)" >&2; exit 1; }
JAVAC="$JDK/bin/javac"; JAR="$JDK/bin/jar"
[ -x "$JAVAC.exe" ] && JAVAC="$JAVAC.exe" && JAR="$JAR.exe"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$AMBOT/src" "$WORK/src"
mkdir -p "$WORK/src/ambot/web" "$WORK/classes"
cp "$HERE/WebAudio.java" "$HERE/WebFit.java" "$HERE/WebSession.java" "$WORK/src/ambot/web/"

# patch <file> <exact text> <replacement>: fails loudly if the text is no longer there
patch_line() {
  local file="$WORK/src/$1"
  grep -qF -- "$2" "$file" || { echo "Patch target not found in $1: $2" >&2; exit 1; }
  local tmp="$file.tmp"
  FIND="$2" REPL="$3" awk '{ i = index($0, ENVIRON["FIND"]); if (i) $0 = substr($0, 1, i-1) ENVIRON["REPL"] substr($0, i + length(ENVIRON["FIND"])); print }' "$file" > "$tmp"
  mv "$tmp" "$file"
}
patch_line ambot/core/Game.java 'SampledAudio.createOrSilent()' 'new ambot.web.WebAudio()'
patch_line ambot/core/Game.java 'if (progress.data().fullscreen()) window.toggleFullscreen();' 'if (!window.isFullscreen()) window.toggleFullscreen();'
patch_line ambot/core/Screen.java 'ScaleMath.fitDevice(' 'ambot.web.WebFit.fitDevice('
patch_line ambot/core/Game.java 'public void quit() {' 'public void quit() { if (ambot.web.WebSession.quit()) return;'

# relative paths: on Windows, javac.exe cannot resolve Git Bash's /tmp paths inside @files
(cd "$WORK" && find src -name '*.java' > sources.txt && "$JAVAC" --release 17 -encoding UTF-8 -nowarn -d classes @sources.txt)
cp -r "$AMBOT/resources/." "$WORK/classes/"

mkdir -p "$OUT"
rm -f "$OUT/ambot.jar"
"$JAR" --create --file "$OUT/ambot.jar" --main-class ambot.Main -C "$WORK/classes" .
rm -rf "$OUT/audio"
cp -r "$AMBOT/resources/audio" "$OUT/audio"

echo "Built $OUT/ambot.jar from AMBOT $(git -C "$AMBOT" rev-parse --short HEAD 2>/dev/null || echo '(no git)')"
