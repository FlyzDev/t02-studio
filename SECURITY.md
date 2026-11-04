# Security

The app has **no user login** by design. Its security model is a trusted local machine or explicitly allowlisted private LAN, not Internet exposure.

Default binding is loopback (`127.0.0.1`), with only loopback clients allowed. If you enable LAN access, set `T02_BIND_HOST`, `T02_ALLOWED_NETWORKS` and a narrow Windows Firewall rule. Never expose the print endpoint through public port forwarding, a reverse proxy or a public tunnel without separately designing authentication and abuse controls.

Please avoid publishing working exploits or other users' documents. When the repository supports private GitHub security advisories, use that feature to report security issues; otherwise open an issue without sensitive details and request a private contact channel.
