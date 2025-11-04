(function () {
  if (window.__disputePortalHeaderNavInitialized) {
    return;
  }
  window.__disputePortalHeaderNavInitialized = true;

  function initializeHeaderNavigation() {
    const menuButton = document.querySelector('.mobile-menu-toggle');
    const navigation = document.querySelector('.header-main-navigation');

    if (!menuButton || !navigation) {
      return;
    }

    const closeMenu = () => {
      navigation.classList.remove('active');
      menuButton.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
      navigation.classList.add('active');
      menuButton.classList.add('is-open');
      menuButton.setAttribute('aria-expanded', 'true');
    };

    const toggleMenu = (event) => {
      event.stopPropagation();
      event.preventDefault();

      const isExpanded = menuButton.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    menuButton.addEventListener('click', toggleMenu);
    navigation.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    navigation.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        closeMenu();
      });
    });

    document.addEventListener('click', (event) => {
      if (!navigation.contains(event.target) && !menuButton.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 960) {
        closeMenu();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initializeHeaderNavigation);
})();
