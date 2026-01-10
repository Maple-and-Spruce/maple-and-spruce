export default function Index() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#D5D6C8',
        color: '#4A3728',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
        Maple & Spruce
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#7A7A6E' }}>
        Inventory Management System
      </p>
      <p
        style={{
          marginTop: '2rem',
          padding: '1rem 2rem',
          backgroundColor: '#6B7B5E',
          color: '#D5D6C8',
          borderRadius: '8px',
        }}
      >
        Coming soon...
      </p>
    </div>
  );
}
