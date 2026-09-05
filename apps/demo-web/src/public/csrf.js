(() => {
  const original = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : input, location.href);
    const method = (init.method || request?.method || 'GET').toUpperCase();
    if (url.origin === location.origin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const headers = new Headers(init.headers || request?.headers);
      headers.set('X-CSRF-Token', document.querySelector('meta[name="csrf-token"]')?.content || '');
      init = { ...init, headers };
    }
    return original(input, init);
  };
})();
