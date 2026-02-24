# ADR-017: Network Discovery — Multi-Protocol

## Status
Accepted

## Date
2025-01-01

## Context
Operators need to discover Axis cameras on their local network without manually entering each camera's IP address. Axis cameras advertise their presence via multiple network protocols. A discovery mechanism that relies on only one protocol will miss cameras where that protocol is disabled or blocked by network policy.

Three candidate protocols are relevant to Axis camera discovery:

1. **HTTP probing**: Directly attempt an HTTP connection to each host in a CIDR range and identify Axis devices by response headers or VAPIX endpoint availability.
2. **Bonjour/mDNS**: Axis cameras broadcast service announcements on the local link using Apple's Bonjour protocol (RFC 6762 / DNS-SD). This is zero-configuration and requires no credentials.
3. **SSDP/UPnP**: Axis cameras respond to UPnP Simple Service Discovery Protocol multicast queries, returning device description XML that includes model and manufacturer information.

SNMP and ONVIF WS-Discovery are alternatives but require additional dependencies and are less universally supported across the Axis product range.

## Decision
Implement **all three discovery protocols** as independent, parallel discovery paths that merge results before presenting them to the user:

1. **HTTP probing**: Iterate over all hosts in a given IPv4 CIDR block and send an HTTP request to port 80/443. Identify Axis devices by checking for Axis-specific response headers (`Server: Axis/...`) or a successful VAPIX `/axis-cgi/param.cgi` probe. Maximum scan size: **10,000 hosts per CIDR** (a /18 network) to prevent runaway scans.

2. **Bonjour/mDNS**: Listen for `_http._tcp.local` and `_axis-video._tcp.local` service announcements. Parse TXT records for model, serial number, and firmware version. This path produces results without scanning and respects camera advertisement settings.

3. **SSDP/UPnP**: Send an `M-SEARCH` multicast to `239.255.255.250:1900` with `ST: urn:axis-com:device:*`. Parse `LOCATION` header responses to fetch device description XML. Extract manufacturer, model, and friendly name from the XML.

All three protocols operate on **IPv4 only**. IPv6 is out of scope for the initial implementation.

Results from all three paths are merged using the camera's MAC address (where available) or IP address as the deduplication key before returning to the caller.

```typescript
interface DiscoveredCamera {
  ipAddress: string;
  macAddress?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  discoveryMethod: 'http_probe' | 'mdns' | 'ssdp';
}

async function discoverCameras(cidr: string): Promise<DiscoveredCamera[]> {
  const [httpResults, mdnsResults, ssdpResults] = await Promise.allSettled([
    httpProbeSubnet(cidr),
    mdnsDiscover(),
    ssdpDiscover(),
  ]);
  return mergeByMacOrIp(httpResults, mdnsResults, ssdpResults);
}
```

## Consequences

### Positive
- Multi-protocol coverage maximises discovery completeness. Cameras with mDNS disabled are found via SSDP or HTTP probe; cameras that don't respond to SSDP are found via mDNS.
- Bonjour/mDNS and SSDP are passive or targeted multicast; they do not generate network noise on subnets the camera is not on.
- HTTP probing provides a fallback for environments where multicast is blocked (e.g., managed switches with IGMP snooping).
- The 10,000-host cap prevents accidental scanning of a large corporate network from a misconfigured CIDR entry.

### Negative
- HTTP probing a /16 (65,535 hosts) with sequential requests would be unacceptably slow; parallel probing with a bounded concurrency pool is necessary and must be tuned carefully to avoid triggering network intrusion detection systems.
- SSDP responses depend on the camera broadcasting; cameras that are offline or have UPnP disabled will not appear.
- mDNS only works within a single broadcast domain (link-local scope); cameras on different VLANs will not be visible unless an mDNS proxy/repeater is deployed.
- Parsing SSDP device description XML adds an HTTP round-trip per discovered device.

### Neutral
- The maximum 10,000-host CIDR limit is a soft guard enforced in the application layer, not a network-level control. A user with sufficient network access could circumvent it by making multiple smaller CIDR requests.
- ONVIF WS-Discovery would provide richer camera metadata and is the industry-standard protocol for IP cameras but was not included due to the complexity of the ONVIF stack and the project's Axis-specific focus.
- SNMP scanning (OID-based Axis fingerprinting) was considered but requires SNMP community strings, which are often non-default or disabled.

## Technical Debt
- IPv6 support is not implemented. As IPv6 adoption increases in enterprise networks, camera discovery on IPv6-only or dual-stack networks will fail silently.
- The CIDR scan implementation should be made resumable and cancellable; long-running scans currently have no progress reporting or abort mechanism.
- The HTTP probe concurrency limit should be configurable via an environment variable to accommodate different network environments.

## Related
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
- [ADR-018: Historical Backfill](adr-018-historical-backfill.md)
- [ADR-020: Model Detection](adr-020-model-detection.md)
