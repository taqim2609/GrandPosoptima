export const whatsappSettingsUrl = (view = "pairing") => {
  const base = "/settings?tab=integrations&sub=wa";
  return view === "pairing" ? `${base}&waView=pairing` : base;
};

export const WHATSAPP_PAIRING_SETTINGS_URL = whatsappSettingsUrl();
