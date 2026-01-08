import React from 'react';

const Layout = ({ children }) => {
  return (
    <div className="app-container">
      <header className="glass-panel header">
        <div className="logo">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-accent)' }}>
            Squad<span style={{ color: 'var(--text-primary)' }}> Sync</span>
          </h1>
        </div>


      </header>

      <main className="main-content" style={{ display: 'flex', gap: 'var(--spacing-lg)', flex: 1 }}>
        {children}
      </main>
    </div>
  );
};

export default Layout;
