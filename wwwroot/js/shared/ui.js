/**
* Non-blocking Toast Notification
*/
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colors = {
        info: 'bg-slatefelt-800 border-slatefelt-700 text-slate-100',
        success: 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100',
        warning: 'bg-amber-950/95 border-amber-500/60 text-amber-100',
        danger: 'bg-rose-950/95 border-rose-500/60 text-rose-100'
    };
    toast.className = `px-4 py-2.5 rounded-xl border shadow-xl text-sm font-medium backdrop-blur transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
    toast.textContent = message;
    container.appendChild(toast);


    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });


    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 2600);
}


/**
* MODALS (End Game Summary & Reset Confirmation)
*/
function openModal(html) {
    const backdrop = document.getElementById('modal-backdrop');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    backdrop.classList.remove('hidden');
}


function closeModal() {
    document.getElementById('modal-backdrop').classList.add('hidden');
}


document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
        closeModal();
    }
});