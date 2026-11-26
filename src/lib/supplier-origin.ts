/** Supplier tier is decided from the phone's GPS position (not IP), so a VPN cannot change it. */
export type SupplierOrigin = "gh" | "intl";

export function originFromGps(lat: number, lng: number): SupplierOrigin {
  return lat >= 4.5 && lat <= 11.2 && lng >= -3.3 && lng <= 1.25 ? "gh" : "intl";
}

export const SUPPLIER_FEE_KEY: Record<SupplierOrigin, "supplier_registration_gh" | "supplier_registration_intl"> = {
  gh: "supplier_registration_gh",
  intl: "supplier_registration_intl",
};

export const SUPPLIER_CURRENCY: Record<SupplierOrigin, "GHS" | "USD"> = { gh: "GHS", intl: "USD" };

export function formatSupplierFee(origin: SupplierOrigin, amount: number) {
  return origin === "gh" ? `GH₵ ${amount.toLocaleString()}` : `$${amount.toLocaleString()}`;
}

/** Ghana uses GMT all year; a phone set to another zone is not physically configured for Ghana. */
export function timeZoneLooksGhanaian(timeZone: string | undefined, offsetMinutes: number | undefined) {
  if (timeZone && /^(Africa\/Accra|Etc\/GMT|Etc\/UTC|GMT|UTC)$/.test(timeZone)) return offsetMinutes === undefined || offsetMinutes === 0;
  if (timeZone) return false;
  return offsetMinutes === 0;
}

/** Ghanaian mobile numbers: 0XXXXXXXXX or 233XXXXXXXXX with a 2/5 network prefix. */
export function isGhanaianMobile(raw: string | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  const local = digits.startsWith("233") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : "";
  return /^[25]\d{8}$/.test(local);
}

const HOSTING_HINTS = /(amazon|aws|google cloud|microsoft|azure|digitalocean|linode|akamai|ovh|hetzner|vultr|m247|datacamp|nordvpn|expressvpn|surfshark|proton|mullvad|private internet|hosting|vpn|proxy|tor\b|cdn77|choopa|leaseweb)/i;

export type SpoofCheckInput = {
  gpsOrigin: SupplierOrigin;
  ipCountry?: string | null;
  networkOrg?: string | null;
  timeZone?: string | undefined;
  offsetMinutes?: number | undefined;
  momoNumber?: string | undefined;
};

/** Returns a reason the Ghana rate is refused, or null when every signal agrees with a Ghana location. */
export function ghanaSpoofReason(input: SpoofCheckInput): string | null {
  if (input.gpsOrigin !== "gh") return null;
  if (input.networkOrg && HOSTING_HINTS.test(input.networkOrg)) return "Please turn off your VPN or proxy, then try again.";
  if (input.ipCountry && !["GH", "XX", "T1"].includes(input.ipCountry.toUpperCase())) return "Your network is outside Ghana, so the Ghana supplier rate can't be used. Turn off any VPN or location app and try again.";
  if (input.ipCountry?.toUpperCase() === "T1") return "Please turn off Tor or your VPN, then try again.";
  if (!timeZoneLooksGhanaian(input.timeZone, input.offsetMinutes)) return "Your phone's time zone isn't set to Ghana. Set it to automatic and try again.";
  if (!isGhanaianMobile(input.momoNumber)) return "Enter your Ghanaian Mobile Money number (MTN, Telecel or AT) to pay the Ghana rate.";
  return null;
}
