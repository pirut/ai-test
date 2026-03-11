# Supported Media

## Accepted

- Images: `jpg`, `png`, `webp`
- Videos: `mp4` with `H.264` video and `AAC` audio
- Remote videos: canonical YouTube watch URLs, resolved into local `mp4` cache files during sync

## Limits

- Maximum file size: `250 MB`
- Maximum resolution target: `1920x1080`

## Playback rules

- Images default to `10` seconds unless overridden in the playlist item.
- Videos play through their full duration.
- YouTube-backed videos are fetched at sync time in the highest compatible quality for the current target profile.
- Devices use cached content and do not stream media from the internet during playback.
