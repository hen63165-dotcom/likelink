#!/usr/bin/env bash
# Talking Luna: one still image + a voice track -> a video where the face
# talks (lips follow the words), blinks and moves the head naturally.
# Engine: SadTalker (Tencent, Apache-2.0), open weights from its GitHub
# releases, CPU only — no account, no key, nothing paid.
#
#   scripts/media/talking/talk.sh <image> <voice audio> <out dir> [variant...]
#
# Variants (one MP4 each, so they can be compared side by side):
#   full-still   whole picture kept, the face talks and blinks, calm head
#   full-move    whole picture kept, natural head motion while talking
#   face         a tighter talking-face crop (the most motion)
# The result is always synthetic: every reel made from it carries the label
# "דמות שנוצרה בבינה מלאכותית" (the tip renderer burns it in).
set -euo pipefail
IMG=$(realpath "$1"); AUDIO=$(realpath "$2"); OUT=$(realpath -m "$3"); shift 3
VARIANTS=("${@:-full-still full-move face}")  # word-split below
ST=${SADTALKER_DIR:-$HOME/sadtalker}
mkdir -p "$OUT"

if [ ! -d "$ST/.git" ]; then
  git clone -q --depth 1 https://github.com/OpenTalker/SadTalker.git "$ST"
fi
mkdir -p "$ST/checkpoints" "$ST/gfpgan/weights"
get() { [ -s "$2" ] || curl -sSL --retry 3 -o "$2" "$1"; }
R=https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc
get "$R/mapping_00109-model.pth.tar" "$ST/checkpoints/mapping_00109-model.pth.tar"
get "$R/mapping_00229-model.pth.tar" "$ST/checkpoints/mapping_00229-model.pth.tar"
get "$R/SadTalker_V0.0.2_256.safetensors" "$ST/checkpoints/SadTalker_V0.0.2_256.safetensors"
get https://github.com/xinntao/facexlib/releases/download/v0.1.0/alignment_WFLW_4HG.pth "$ST/gfpgan/weights/alignment_WFLW_4HG.pth"
get https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth "$ST/gfpgan/weights/detection_Resnet50_Final.pth"

WAV="$OUT/.voice.wav"
# TALK_SECONDS (optional) keeps only the first N seconds of the voice.
ffmpeg -y -loglevel error -i "$AUDIO" ${TALK_SECONDS:+-t "$TALK_SECONDS"} -ac 1 -ar 16000 "$WAV"

for v in ${VARIANTS[*]}; do
  case "$v" in
    full-still) args=(--preprocess full --still) ;;
    full-move)  args=(--preprocess full --pose_style 12 --expression_scale 1.1) ;;
    face)       args=(--preprocess extcrop --pose_style 12 --expression_scale 1.1) ;;
    *) echo "unknown variant $v" >&2; exit 2 ;;
  esac
  res="$OUT/.run-$v"
  rm -rf "$res"
  t0=$(date +%s)
  (cd "$ST" && python inference.py --cpu --driven_audio "$WAV" --source_image "$IMG" \
     --result_dir "$res" --size 256 --batch_size 4 "${args[@]}")
  mp4=$(find "$res" -name '*.mp4' | head -1)
  [ -n "$mp4" ] || { echo "no video for $v" >&2; exit 1; }
  # H.264 + AAC 48 kHz, the same voice track (SadTalker writes its own copy).
  ffmpeg -y -loglevel error -i "$mp4" -i "$AUDIO" -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -crf 20 \
    -c:a aac -b:a 128k -ar 48000 -shortest -movflags +faststart "$OUT/luna-$v.mp4"
  ffmpeg -y -loglevel error -ss 3 -i "$OUT/luna-$v.mp4" -frames:v 1 "$OUT/luna-$v.jpg"
  echo "$v: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/luna-$v.mp4")s in $(( $(date +%s) - t0 ))s"
  rm -rf "$res"
done
rm -f "$WAV"
