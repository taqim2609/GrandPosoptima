import { whatsappSettingsUrl } from "./whatsappSettings";

describe("whatsappSettingsUrl", () => {
  test("mengarahkan pairing ke Pengaturan WA Gateway", () => {
    expect(whatsappSettingsUrl()).toBe("/settings?tab=integrations&sub=wa&waView=pairing");
  });

  test("mempertahankan tampilan gateway default tanpa parameter pairing", () => {
    expect(whatsappSettingsUrl("gateway")).toBe("/settings?tab=integrations&sub=wa");
  });
});
