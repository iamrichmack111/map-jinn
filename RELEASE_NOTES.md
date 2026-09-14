# Map Jinn 17.4.2

This release keeps the approved 17.4 footprint-map experience unchanged and repairs the GitHub delivery pipeline.

## Release engineering fixes

- Reliable Playwright smoke-test workflow.
- Playwright-generated login, workspace, and footprint-map screenshots.
- Playwright-recorded demo converted to H.264 MP4 with ffmpeg.
- Docker image build plus live `/api/health` container test.
- Media is uploaded as a GitHub Actions artifact and committed to the repository when permitted.
- Release creation is idempotent: reruns refresh an existing GitHub Release instead of failing because the release already exists.
- Release assets include source ZIP, checksums, three screenshots, and the MP4 demo.

## Map behavior

No map-design changes are included in this release. It retains the approved clean-street footprint map, apparel labels, login, nationwide place search, saved footprint places, and export controls.
