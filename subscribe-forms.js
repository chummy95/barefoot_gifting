(function () {
  function ensureStatusNode(container) {
    let status = container.nextElementSibling;
    if (!status || !status.classList.contains('subscribe-status')) {
      status = document.createElement('div');
      status.className = 'subscribe-status';
      status.style.marginTop = '10px';
      status.style.fontSize = '12px';
      status.style.lineHeight = '1.5';
      container.insertAdjacentElement('afterend', status);
    }
    return status;
  }

  function setStatus(container, message, tone) {
    const status = ensureStatusNode(container);
    status.textContent = message || '';
    status.style.color = tone === 'success'
      ? '#2f6b2f'
      : tone === 'error'
        ? '#dd4040'
        : 'rgba(22,22,22,.6)';
  }

  function clearStatus(container) {
    const status = container.nextElementSibling;
    if (status && status.classList.contains('subscribe-status')) {
      status.textContent = '';
    }
  }

  function getEmailInput(container) {
    return container.querySelector('input[type="email"]');
  }

  function getButton(container) {
    return container.querySelector('button');
  }

  function getSource(container) {
    if (container.id === 'popup-form') return 'popup';
    return 'newsletter';
  }

  function isPopupForm(container) {
    return container.id === 'popup-form';
  }

  async function submitSubscription(payload) {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }
    }
    if (!response.ok) {
      throw new Error(data?.error || 'We could not save your email right now.');
    }
    return data;
  }

  async function handleContainerSubmit(container) {
    const input = getEmailInput(container);
    const button = getButton(container);
    if (!input || !button) return;

    input.required = true;
    clearStatus(container);

    if (!input.checkValidity()) {
      input.reportValidity?.();
      setStatus(container, 'Enter a valid email address to join the list.', 'error');
      return;
    }

    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = 'Joining...';

    try {
      await submitSubscription({
        email: input.value.trim(),
        source: getSource(container),
        page: window.location.pathname,
      });

      input.value = '';

      if (isPopupForm(container)) {
        const wrap = document.getElementById('popup-form-wrap');
        const success = document.getElementById('popup-success');
        if (wrap && success) {
          wrap.style.display = 'none';
          success.style.display = 'block';
        }
      } else {
        setStatus(container, "You're on the list. Watch your inbox for Barefoot updates.", 'success');
      }
    } catch (error) {
      setStatus(container, error.message || 'We could not save your email right now.', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  }

  function bindFormContainer(container) {
    if (!container || container.dataset.subscribeBound === 'true') return;

    const input = getEmailInput(container);
    const button = getButton(container);
    if (!input || !button) return;

    container.dataset.subscribeBound = 'true';

    if (container.tagName === 'FORM') {
      container.addEventListener('submit', (event) => {
        event.preventDefault();
        handleContainerSubmit(container);
      });
      return;
    }

    button.type = 'button';
    button.addEventListener('click', () => handleContainerSubmit(container));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleContainerSubmit(container);
      }
    });
  }

  function init(root = document) {
    const containers = new Set([
      ...root.querySelectorAll('.f-nl-form'),
      ...root.querySelectorAll('.nl-form'),
      ...root.querySelectorAll('#popup-form'),
    ]);

    containers.forEach((container) => bindFormContainer(container));
  }

  window.BarefootSubscribeForms = { init };
})();
