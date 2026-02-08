const modal = document.getElementById('admin-modal');
const trigger = document.getElementById('admin-trigger');
const cancelButton = document.getElementById('admin-cancel');
const enterButton = document.getElementById('admin-enter');
const input = document.getElementById('admin-key-input');

const openModal = () => {
  modal.classList.add('is-open');
  input.focus();
};

const closeModal = () => {
  modal.classList.remove('is-open');
  input.value = '';
};

trigger.addEventListener('click', openModal);
cancelButton.addEventListener('click', closeModal);

enterButton.addEventListener('click', () => {
  const key = input.value.trim();
  if (key) {
    localStorage.setItem('moltville_admin_key', key);
    window.location.href = './admin.html';
  }
});

modal.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});
