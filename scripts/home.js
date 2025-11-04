// HSBC-Style Homepage JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication and update header
    initAuthenticatedHeader();
    
    // Smooth scroll for anchor links
    initSmoothScroll();
    
    // Animate elements on scroll
    initScrollAnimations();
    
    // Header scroll effect
    initHeaderScroll();
});

    // header authentication is handled by scripts/headerAuth.js

/**
 * Initialize smooth scrolling for anchor links
 */
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Skip if it's just "#"
            if (href === '#') {
                e.preventDefault();
                return;
            }
            
            const target = document.querySelector(href);
            
            if (target) {
                e.preventDefault();
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = target.offsetTop - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Initialize scroll animations
 */
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe elements that should animate in
    const animateElements = document.querySelectorAll(
        '.feature-card, .quick-link-card, .timeline-item, .trust-item, .help-card'
    );
    
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

/**
 * Initialize header scroll effect
 */
function initHeaderScroll() {
    const header = document.querySelector('.header');
    let lastScroll = 0;
    
    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });
}

/**
 * Add animation class to elements when they come into view
 */
document.addEventListener('scroll', function() {
    const elements = document.querySelectorAll('.animate-in');
    
    elements.forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    });
});

/**
 * Handle CTA button clicks with analytics (if needed)
 */
const ctaButtons = document.querySelectorAll('.cta-section .btn, .hero-banner .btn');
ctaButtons.forEach(btn => {
    btn.addEventListener('click', function(e) {
        // Add analytics tracking here if needed
        console.log('CTA clicked:', this.textContent.trim());
    });
});

/**
 * Add hover effect to cards
 */
const cards = document.querySelectorAll('.feature-card, .quick-link-card, .help-card');
cards.forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s ease';
    });
});

/**
 * Lazy load images
 */
function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// Initialize lazy loading if there are images with data-src
if (document.querySelectorAll('img[data-src]').length > 0) {
    initLazyLoading();
}

/**
 * Add accessibility enhancements
 */
function enhanceAccessibility() {
    // Add keyboard navigation for cards
    const interactiveCards = document.querySelectorAll('.quick-link-card, .feature-card');
    
    interactiveCards.forEach(card => {
        card.setAttribute('tabindex', '0');
        
        card.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
    });
}

enhanceAccessibility();

/**
 * Add print styles trigger
 */
window.addEventListener('beforeprint', function() {
    document.body.classList.add('printing');
});

window.addEventListener('afterprint', function() {
    document.body.classList.remove('printing');
});

// Export functions for testing if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initSmoothScroll,
        initMobileMenu,
        initScrollAnimations,
        initHeaderScroll
    };
}
