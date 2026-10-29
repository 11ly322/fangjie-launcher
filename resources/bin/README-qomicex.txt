Qomicex Connector CLI (GPL-3.0-or-later)
========================================

This directory contains qomicex-connector-cli.exe, a separately executable
Rust program that links EasyTier as a library (no external easytier-core
process, no TUN device, no administrator rights).

Upstream: https://github.com/Qomicex-Public/qomicex-connector-rust
Pinned commit: c43421925a6711baf4dcef36d234abe31bed2a43
Patch: native/qomicex-no-packet.patch in the launcher repository
Build: .github/workflows/connector-build.yml

The patch removes the faketcp/wireguard/proxy-packet/vpn-portal features,
forces no-TUN + smoltcp for both host and guest, and avoids a packet.dll
runtime dependency. The connector is a separate GPL-licensed component;
the launcher source remains under its own MIT license.

The full GPLv3 text is in LICENSE-qomicex.txt. The source code is available
at the upstream URL above; the exact local modifications are in the patch
file referenced above.
