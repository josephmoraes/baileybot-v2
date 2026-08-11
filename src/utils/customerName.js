export function isPhoneLikeName(value) {
    const text = String(value ?? "").trim();
    const digits = text.replace(/\D/g, "");
    return digits.length >= 7 && /^[\d\s()+.-]+$/.test(text);
}

export function cleanCustomerName(value) {
    const text = String(value ?? "").trim();
    return isPhoneLikeName(text) ? "" : text;
}
