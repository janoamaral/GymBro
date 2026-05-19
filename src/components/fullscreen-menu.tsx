'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const menuItems = [
  { href: '/', label: 'Home' },
  { href: '/peso', label: 'Peso' },
  { href: '/nutrition', label: 'Nutricion' },
];

export function FullscreenMenu() {
  const currentPath = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    globalThis.addEventListener('keydown', onEscape);

    return () => {
      document.body.style.overflow = '';
      globalThis.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-full border border-[#d6ff43]/35 bg-[#d6ff43]/10 p-2 text-[#d6ff43] transition-all hover:border-[#d6ff43] hover:bg-[#d6ff43]/20"
        aria-label="Abrir menú"
        title="Menú"
      >
        <Menu size={22} />
      </button>

      <div
        className={`fixed inset-0 z-50 bg-[#d6ff43] text-[#101010] transition-all duration-500 ease-out ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex h-full flex-col px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex justify-end">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-[#101010]/30 p-2 transition-all hover:border-[#101010] hover:bg-[#101010]/10"
              aria-label="Cerrar menú"
              title="Cerrar"
            >
              <X size={22} />
            </button>
          </div>

          <nav className="mt-2 flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col justify-center space-y-3">
              {menuItems.map((item, index) => {
                const isActive = currentPath === item.href;
                let delayClass = 'menu-delay-3';
                if (index === 0) {
                  delayClass = 'menu-delay-1';
                } else if (index === 1) {
                  delayClass = 'menu-delay-2';
                }
                return (
                  <li
                    key={item.href}
                    className={`menu-item-slide ${delayClass} ${isOpen ? 'menu-item-slide--visible' : ''}`}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={`block text-5xl font-heading leading-none sm:text-6xl ${
                        isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div
              className={`mt-auto menu-item-slide menu-delay-4 ${isOpen ? 'menu-item-slide--visible' : ''}`}
            >
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className={`block border-t border-[#101010]/25 pt-5 text-4xl font-heading leading-none sm:text-5xl ${
                  currentPath === '/settings' ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                }`}
              >
                Perfil
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
