# Contributing

Issues and pull requests are welcome, particularly for printing fidelity, accessibility, PDF layout and alternative thermal-printer support.

1. Describe the model, operating system, connection type and a reproducible problem. **Redact Bluetooth addresses, usernames, private LAN addresses and document contents** from examples and logs.
2. Keep public changes generic. Do not hardcode personal IP addresses, ports, credentials or absolute home-directory paths.
3. Run `python -m unittest discover -s tests -v` and `node tests/test_studio_core.js` before a PR.
4. UI changes should work in `/alt` and preserve the existing `/` and `/classic` routes. Keep the 384-dot print bitmap independent of selection handles.
5. Avoid an automatic retry after serial failure; the device may have already printed part of a job.

New contributions must be compatible with the repository's AGPL-3.0-only license and should identify third-party source or asset licenses. No cloud API is required to contribute.
