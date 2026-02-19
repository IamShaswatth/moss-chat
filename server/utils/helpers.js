export function formatDate(date) {
    return new Date(date).toISOString();
}

export function truncate(str, maxLen = 100) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
}
