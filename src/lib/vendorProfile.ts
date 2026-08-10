/* Mirrors packages/api/src/utils/vendorProfile.js (REQUIRED_VENDOR_PROFILE_FIELDS)
   and the client-side copy in apps/admin/src/pages/vendor/VendorSettings.jsx
   (REQUIRED_PROFILE_FIELDS / getMissingProfileFields) — the basic details a
   vendor must fill in before they're allowed past the agreement/dashboard.
   Only actually missing for "Partner with us" self-signups; vendors onboarded
   via the full wizard already have all of these. */
export const REQUIRED_VENDOR_PROFILE_FIELDS: { key: string; label: string; numeric?: boolean }[] = [
  { key: "name",              label: "Restaurant Name" },
  { key: "contactPersonName", label: "Contact Person Name" },
  { key: "addressLine",       label: "Address Line" },
  { key: "city",              label: "City" },
  { key: "pincode",           label: "PIN Code" },
  { key: "legalEntityName",   label: "Legal Entity Name" },
  { key: "businessType",      label: "Business Type" },
  { key: "fssaiNumber",       label: "FSSAI License Number" },
  { key: "pan",                label: "PAN Number" },
  // "Partner with us" self-signups start at the (0, 0) sentinel — 0 must
  // count as missing here, not just "" — otherwise a vendor can clear this
  // gate without ever setting a real location, and their restaurant stays
  // outside every user's delivery radius forever.
  { key: "lat", label: "Restaurant Location (Latitude)",  numeric: true },
  { key: "lng", label: "Restaurant Location (Longitude)", numeric: true },
];

export function getMissingProfileFields(restaurant: Record<string, any> | null | undefined): string[] {
  if (!restaurant) return REQUIRED_VENDOR_PROFILE_FIELDS.map(f => f.label);
  return REQUIRED_VENDOR_PROFILE_FIELDS
    .filter(f => {
      const raw = restaurant[f.key];
      if (f.numeric) {
        const n = parseFloat(raw);
        return raw === null || raw === undefined || raw === "" || Number.isNaN(n) || n === 0;
      }
      return !String(raw ?? "").trim();
    })
    .map(f => f.label);
}
