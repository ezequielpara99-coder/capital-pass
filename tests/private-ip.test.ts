import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateOrReservedIp } from "../lib/sales-agent/private-ip";

test("investigar prospecto: bloquea direcciones internas, tambien disfrazadas de IPv6", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "200.45.1.1", "2800:3f0:4002:80c::200e", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateOrReservedIp(ip), false, ip);
  }
});
