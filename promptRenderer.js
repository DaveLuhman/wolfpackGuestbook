document.addEventListener('DOMContentLoaded', () => {
  const metaTag = document.querySelector('meta[name="response-channel"]');
  if (!metaTag) {
    console.error('Response channel meta tag not found');
    return;
  }
  const responseChannel = metaTag.getAttribute('content');

  const submitBtn = document.getElementById('submit');
  const cancelBtn = document.getElementById('cancel');
  const pwdInput = document.getElementById('pwd');

  submitBtn.addEventListener('click', () => {
    window.Electron.sendResponse(responseChannel, pwdInput.value);
  });

  cancelBtn.addEventListener('click', () => {
    window.Electron.sendResponse(responseChannel, null);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.Electron.sendResponse(responseChannel, pwdInput.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      window.Electron.sendResponse(responseChannel, null);
    }
  });
});