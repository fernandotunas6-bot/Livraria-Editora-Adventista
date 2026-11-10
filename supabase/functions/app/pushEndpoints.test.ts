import { describe, expect, it } from "vitest";
import { isPushEndpoint } from "./pushEndpoints.ts";

describe("isPushEndpoint", () => {
  it("aceita os serviços de push dos navegadores", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123:APA91b")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAAA")).toBe(true);
    expect(isPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=BQYAAA")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QGxxx")).toBe(true);
  });

  it("recusa outros servidores, http, portas e credenciais", () => {
    expect(isPushEndpoint("https://exemplo.ao/recolher")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.exemplo.ao/x")).toBe(false);
    expect(isPushEndpoint("https://evilfcm.googleapis.com.ao/x")).toBe(false);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://user:pw@fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("")).toBe(false);
    expect(isPushEndpoint(null)).toBe(false);
  });
});
