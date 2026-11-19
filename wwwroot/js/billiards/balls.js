/**
* Pool Ball Color Metadata (Standard WPA / Aramith Colors)
*/
const BALL_STYLES = {
    1: { color: '#eab308', stripe: false, name: 'Yellow' },
    2: { color: '#2563eb', stripe: false, name: 'Blue' },
    3: { color: '#dc2626', stripe: false, name: 'Red' },
    4: { color: '#7c3aed', stripe: false, name: 'Purple' },
    5: { color: '#f97316', stripe: false, name: 'Orange' },
    6: { color: '#16a34a', stripe: false, name: 'Green' },
    7: { color: '#881337', stripe: false, name: 'Maroon' },
    8: { color: '#1e293b', stripe: false, name: 'Black' },
    9: { color: '#eab308', stripe: true, name: 'Yellow Stripe' },
    10: { color: '#2563eb', stripe: true, name: 'Blue Stripe' },
    11: { color: '#dc2626', stripe: true, name: 'Red Stripe' },
    12: { color: '#7c3aed', stripe: true, name: 'Purple Stripe' },
    13: { color: '#f97316', stripe: true, name: 'Orange Stripe' },
    14: { color: '#16a34a', stripe: true, name: 'Green Stripe' },
    15: { color: '#881337', stripe: true, name: 'Maroon Stripe' }
};


/**
* Helper: Render HTML for an authentic pool ball
*/
function renderPoolBallHTML(num, sizeClass = 'w-10 h-10', numSizeClass = 'w-5 h-5 text-xs') {
    const meta = BALL_STYLES[num] || { color: '#64748b', stripe: false };
    const stripeClass = meta.stripe ? 'stripe' : '';
    const bgStyle = meta.stripe ? `--ball-color: ${meta.color};` : `background-color: ${meta.color};`;
    return `
            <span class="pool-ball ${stripeClass} ${sizeClass}" style="${bgStyle}">
                <span class="pool-ball-number ${numSizeClass}">${num}</span>
            </span>
            `;
}