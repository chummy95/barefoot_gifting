(function () {
  function getCartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem('bfg_cart') || '[]');
      return Array.isArray(cart) ? cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) : 0;
    } catch {
      return 0;
    }
  }

  function updateCartBadges() {
    const count = getCartCount();
    document.querySelectorAll('.cart-badge').forEach((badge) => {
      badge.textContent = String(count);
    });
  }

  function enhanceAccountLinks() {
    document.querySelectorAll('.nav-shell a[aria-label="My Account"], .nav-shell a.nav-account-link').forEach((link) => {
      link.href = '/account/index.html';
      link.classList.add('nav-account-link');
      link.setAttribute('aria-label', 'Customer Sign In');
      link.setAttribute('title', 'Customer sign in or create an account');
      link.removeAttribute('style');
      link.innerHTML = '<span>Sign In</span>';
    });
  }

  function ensureRemembersLinks() {
    const isRemembersPage = /\/remembers\.html(?:$|[?#])/.test(window.location.pathname + window.location.search + window.location.hash);
    document.querySelectorAll('.nav-shell .nav-r .nav-links').forEach((list) => {
      if (list.querySelector('[data-nav-remembers]')) return;

      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = './remembers.html';
      link.textContent = 'Remembers';
      link.dataset.navRemembers = 'true';
      if (isRemembersPage) link.classList.add('hi');
      item.appendChild(link);

      const contactLink = [...list.querySelectorAll('a')].find((anchor) => anchor.textContent.trim().toLowerCase() === 'contact');
      const contactItem = contactLink ? contactLink.closest('li') : null;
      if (contactItem) list.insertBefore(item, contactItem);
      else list.appendChild(item);
    });
  }

  function createNavToggle() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-toggle';
    button.setAttribute('aria-label', 'Open menu');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('data-nav-toggle', '');
    button.innerHTML = '<span class="nav-toggle-lines" aria-hidden="true"><span></span><span></span><span></span></span>';
    return button;
  }

  function createDrawerMarkup() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="nav-drawer-backdrop" data-nav-close></div>
      <aside class="nav-drawer" data-nav-drawer aria-hidden="true">
        <div class="nav-drawer-top">
          <a href="./index.html" aria-label="Barefoot Gifting home"><img src="./Png Files/Logo-cropped.png" alt="Barefoot Gifting"></a>
          <button class="nav-drawer-close" type="button" aria-label="Close menu" data-nav-close>&times;</button>
        </div>
        <div class="nav-drawer-body">
          <div class="nav-drawer-group">
            <div class="nav-drawer-label">Shop</div>
            <div class="nav-drawer-links">
              <a href="./shop.html">All Products</a>
              <a href="./shop.html?filter=Greeting%20Cards#shop-results">Greeting Cards</a>
              <a href="./shop.html?filter=Little%20Luxes#shop-results">Little Luxes</a>
              <a href="./shop.html?filter=Stationery#shop-results">Stationery</a>
              <a href="./shop.html?filter=Corporate%20Gifts#shop-results">Corporate Gifts</a>
            </div>
          </div>
          <div class="nav-drawer-group">
            <div class="nav-drawer-label">Explore</div>
            <div class="nav-drawer-links">
              <a href="./corporate.html">Corporate Gifting</a>
              <a href="./concierge.html">Concierge Gifting</a>
              <a href="./thc.html">Husbands Club</a>
              <a href="./journal.html">Keepsake Edit</a>
              <a href="./remembers.html">Barefoot Remembers</a>
              <a href="./contact.html">Contact</a>
              <a href="./faqs.html">FAQs</a>
            </div>
          </div>
          <div class="nav-drawer-group">
            <div class="nav-drawer-label">Quick Access</div>
            <div class="nav-drawer-utility">
              <a class="nav-drawer-chip" href="/account/index.html">Sign In</a>
              <a class="nav-drawer-chip" href="./cart.html">Cart <span class="cart-badge">0</span></a>
            </div>
          </div>
          <div class="nav-drawer-contact">
            <p class="nav-drawer-note">Thoughtful gifting, concierge support, and same-day Abuja delivery for moments that matter.</p>
            <a href="mailto:hello@barefootgifting.com">hello@barefootgifting.com</a>
            <a href="https://wa.me/2349011287992" target="_blank" rel="noopener">WhatsApp us</a>
          </div>
        </div>
      </aside>
    `;
    return wrapper;
  }

  function setupNavDrawer() {
    const navShell = document.querySelector('.nav-shell');
    const nav = navShell?.querySelector('.nav');
    const navRight = nav?.querySelector('.nav-r');
    if (!navShell || !nav || !navRight) return;

    if (!nav.querySelector('[data-nav-toggle]')) {
      const toggle = createNavToggle();
      navRight.insertBefore(toggle, navRight.firstChild);
    }

    if (!document.querySelector('[data-nav-drawer]')) {
      const drawerNodes = createDrawerMarkup();
      navShell.insertAdjacentElement('afterend', drawerNodes.firstElementChild);
      navShell.insertAdjacentElement('afterend', drawerNodes.lastElementChild);
    }

    const navToggle = document.querySelector('[data-nav-toggle]');
    const navDrawer = document.querySelector('[data-nav-drawer]');
    const navCloseTargets = document.querySelectorAll('[data-nav-close]');
    if (!navToggle || !navDrawer) return;

    const closeMobileNav = () => {
      document.body.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navDrawer.setAttribute('aria-hidden', 'true');
    };

    const openMobileNav = () => {
      document.body.classList.add('nav-open');
      navToggle.setAttribute('aria-expanded', 'true');
      navDrawer.setAttribute('aria-hidden', 'false');
    };

    navToggle.addEventListener('click', () => {
      if (document.body.classList.contains('nav-open')) closeMobileNav();
      else openMobileNav();
    });

    navCloseTargets.forEach((node) => node.addEventListener('click', closeMobileNav));
    navDrawer.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobileNav));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMobileNav();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1180) closeMobileNav();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    enhanceAccountLinks();
    ensureRemembersLinks();
    setupNavDrawer();
    updateCartBadges();
  });
})();
