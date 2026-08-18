# Flowscanner Testing Guide (Quiklook 3)

## Overview
This guide provides a concise, offline-first reference for field technicians using the Quiklook 3 Flowscanner to test Air Operated Valves (AOVs). It focuses on a repeatable test flow, how to capture and attach logs into PlantPouch, and a compact troubleshooting layout you can follow on-site.

## Goals
- Give a clear test checklist technicians can follow in the field
- Explain how to collect and attach raw logs to PlantPouch
- Provide a compact troubleshooting decision tree for quick on-site fixes

## Safety & Preparation
- Follow site safety procedures (PPE, lockout/tagout) before starting any test.
- Required items: Quiklook 3 Flowscanner, calibration/zero kit, test fittings, notebook/phone, PPE.
- Confirm the Flowscanner battery or charger, and clean connector pins before connecting.

## Quick Checklist (one-screen)
1. Record valve identifier (tag, location, serial) in PlantPouch.
2. Attach Flowscanner cables and fittings; confirm snug connections.
3. Power on the Flowscanner and load the correct Quiklook AOV profile.
4. Run pre-check: zero/calibrate and verify signal present.
5. Run the test and save/export the raw log to PlantPouch.

## Detailed Test Procedure
1. Identify the valve and create or open the PlantPouch equipment entry.
2. Connect the Flowscanner using the manufacturer cable layout; verify mechanical seals.
3. Power the instrument and confirm the device shows a ready state.
4. Configure test options: flow units, sample rate, test length, and any tag metadata.
5. Perform zeroing/calibration per Quiklook procedures.
6. Start the test and watch live data for immediate errors (flatline, spikes, disconnects).
7. Stop the test, save the raw file, and attach it to the PlantPouch record with notes.

## Exporting & Attaching Logs
- Export the raw log from the Quiklook device (USB or device export). If the file is large, attach a compressed copy and include test metadata in PlantPouch notes.
- Required metadata to include: valve tag, test start/end time, operator initials, test profile used.

## Interpreting Common Outputs (high level)
- Normal signature: smooth ramp/expected pulse pattern for the valve stroke.
- Spikes or transient noise: suspect poor electrical connection or intermittent sensor contact.
- Flatline / no-change: likely disconnected sensor, bad cable, or powered-off device.
- Offset / drift: instrument zeroing issue — re-zero and repeat calibration.

## Compact Troubleshooting Summary
Follow this short checklist before escalating:
1. Power LED and battery/charger — replace or charge batteries if needed.
2. Re-seat cables and inspect connector pins for corrosion or damage.
3. Re-run zero/calibration and perform a short sample test.
4. If still failing, save the raw log and escalate per site process (create maintenance ticket).

Detailed interactive decision flow is available to technicians via PlantPouch's Help widget (uses the `docs/flowscanner-guide/troubleshoot.json` tree).

## Escalation & Maintenance Tickets
- When creating a ticket, attach the raw log file and a short description of steps taken, timestamps, and operator contact info.
- Prefer anonymized sensor IDs in shared examples — never include personnel-sensitive data.

## Images & Visual Aids
Add the following images to `/help/images/` and reference them below when available:
- `flowscanner-setup.jpg` — correct cable routing and connectors
- `flowscanner-zero.jpg` — zeroing/calibration screen
- `flowscanner-spike-example.png` — sample noisy output

Placeholders are shown in the GUI until images are provided.

## Notes for Developers / Maintainers
- The interactive troubleshooting tree is defined in `docs/flowscanner-guide/troubleshoot.json` and can be rendered client-side.
- Keep the on-device help markdown short and link to examples stored in `docs/` for maintainers.

---
_Expand with sample logs and photos when available; next step is a branching GUI that walks technicians through the decision tree and image-backed steps._
