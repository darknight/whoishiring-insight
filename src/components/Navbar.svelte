<script lang="ts">
  let menuOpen = $state(false);
  let dark = $state(false);
  let activeSection = $state('overview');

  const navItems = [
    { href: '#overview', label: '首页' },
    { href: '#trends', label: '趋势' },
    { href: '#cities', label: '地域' },
    { href: '#tech', label: '技术栈' },
    { href: '#companies', label: '公司' },
  ];

  function handleNavClick(e: MouseEvent, href: string) {
    e.preventDefault();
    menuOpen = false;
    if (href === '#overview') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  $effect(() => {
    dark = document.documentElement.classList.contains('dark');

    const sections = navItems.map((item) => document.querySelector(item.href)).filter(Boolean) as Element[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeSection = entry.target.id;
          }
        }
      },
      { rootMargin: '-50% 0px' }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  });
</script>

<nav class="sticky top-0 z-50 border-b border-(--color-border) bg-(--color-surface)/80 backdrop-blur-lg">
  <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
    <!-- Logo -->
    <a href="#overview" onclick={(e) => handleNavClick(e, '#overview')} class="flex items-center gap-2 font-semibold text-(--color-text-primary) no-underline">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
        <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
        <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
      <span class="hidden sm:inline">谁在招人</span>
    </a>

    <!-- Desktop Nav -->
    <div class="hidden items-center gap-1 md:flex">
      {#each navItems as item}
        <a
          href={item.href}
          onclick={(e) => handleNavClick(e, item.href)}
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors no-underline
            {activeSection === item.href.slice(1)
              ? 'bg-(--color-surface-tertiary) text-(--color-text-primary)'
              : 'text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-surface-tertiary)'}"
        >
          {item.label}
        </a>
      {/each}
    </div>

    <!-- Right section -->
    <div class="flex items-center gap-2">
      <!-- Theme toggle -->
      <button
        onclick={toggleTheme}
        class="flex h-8 w-8 items-center justify-center rounded-md text-(--color-text-secondary) transition-colors hover:bg-(--color-surface-tertiary) hover:text-(--color-text-primary)"
        aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      >
        {#if dark}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        {/if}
      </button>

      <!-- Mobile menu button -->
      <button
        onclick={toggleMenu}
        class="flex h-8 w-8 items-center justify-center rounded-md text-(--color-text-secondary) transition-colors hover:bg-(--color-surface-tertiary) hover:text-(--color-text-primary) md:hidden"
        aria-label="菜单"
      >
        {#if menuOpen}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        {/if}
      </button>
    </div>
  </div>

  <!-- Mobile Nav -->
  {#if menuOpen}
    <div class="border-t border-(--color-border) px-4 pb-3 pt-2 md:hidden">
      {#each navItems as item}
        <a
          href={item.href}
          onclick={(e) => handleNavClick(e, item.href)}
          class="block rounded-md px-3 py-2 text-sm font-medium transition-colors no-underline
            {activeSection === item.href.slice(1)
              ? 'bg-(--color-surface-tertiary) text-(--color-text-primary)'
              : 'text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-surface-tertiary)'}"
        >
          {item.label}
        </a>
      {/each}
    </div>
  {/if}
</nav>
