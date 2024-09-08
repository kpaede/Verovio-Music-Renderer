export function addVerovioStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = './styles.css';
    document.head.appendChild(link);
}
