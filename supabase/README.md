# Pacer database scripts

Run these in the Supabase SQL editor, in order. Each one is also saved in the Pacer project's SQL editor under **Private** with the same number and title, plus a short description.

To see what is installed, run [check_installed.sql](check_installed.sql) (saved as **Pacer 00 - Check installed database pieces (read-only)**). It changes nothing. Every row should say `true`. On 2026-11-17 all eight did.

| Step | Script | Saved query title | What it adds | Status on 2026-11-17 |
| --- | --- | --- | --- | --- |
| 00 | [check_installed.sql](check_installed.sql) | Pacer 00 - Check installed database pieces (read-only) | Read-only status check | — |
| 01 | [student_lessons.sql](student_lessons.sql) | Pacer 01 - Student lessons | Students' saved lessons, synced to their account | Installed |
| 02 | [saved_teacher_lectures.sql](saved_teacher_lectures.sql) | Pacer 02 - Saved teacher lectures | Lectures a teacher saves to reopen later | Installed |
| 03 | [pacer_cloud_storage.sql](pacer_cloud_storage.sql) | Pacer 03 - Teacher cloud storage | Backs up teacher rooms and slide images to the account | Installed 2026-11-17 |
| 04 | [transparent_slide_images.sql](transparent_slide_images.sql) | Pacer 04 - Transparent slide images | Lets the slide bucket accept WebP images (needs 03 first) | Installed 2026-11-17 |
| 05 | [board_collaboration.sql](board_collaboration.sql) | Pacer 05 - Board collaboration | Shared notepads and private student annotations | Installed |
| 06 | [room_keys.sql](room_keys.sql) | Pacer 06 - Room lock (room keys) | Signed board updates, so students only trust the real teacher | Installed 2026-11-16 |
| 07 | [annotation_owner_access.sql](annotation_owner_access.sql) | Pacer 07 - Annotation owner access | Lets the board owner save private annotations (fixes "Board annotations didn't sync" when testing with your own account) | Installed 2026-11-17 |
| 08 | [launch_readiness.sql](launch_readiness.sql) | Pacer 08 - Launch readiness | Waitlist, AI rate limits, usage events, data requests | Installed 2026-11-17 |

Every script is safe to run more than once. Supabase shows a "destructive operations" warning for scripts that contain `drop policy if exists`; that line only replaces an access rule with its new version and does not delete data.
