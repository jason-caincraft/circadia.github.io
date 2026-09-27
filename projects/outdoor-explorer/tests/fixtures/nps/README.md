# NPS parks fixtures

Synthetic, reduced payloads based on the official [NPS v1 schema](https://www.nps.gov/subjects/developer/customcf/swagger.json?03142019), checked 2026-09-26. These are not recorded live responses or current visitor information. No credentials or actual images are included; the reviewed photo URL is intentionally fictional.

The schema defines string `total`/`limit`/`start`, comma-separated states, string coordinates, activities, image attribution, and object-shaped operating hours. The schema's older Yellowstone example uses arrays for hours; page 2 exercises that compatibility case. Fixtures deliberately include a cross-page duplicate, multi-state property, invalid coordinates, null optional lists, and an unapproved image. Tests mutate these saved inputs to cover corrupt pagination, unusable records, and upstream failures.
