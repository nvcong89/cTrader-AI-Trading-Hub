import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getApiBaseUrl } from './config';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${getApiBaseUrl()}/api/login`, { username, password }, {
        withCredentials: true
      });
      navigate('/');
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#111827', color: 'white' }}>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#1f2937', padding: '2rem', borderRadius: '8px', width: '300px' }}>
        <h2 style={{ textAlign: 'center', margin: 0 }}>Agent Hub Login</h2>
        {error && <div style={{ color: '#ef4444' }}>{error}</div>}
        <input 
          type="text" 
          placeholder="Username" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #374151', background: '#374151', color: 'white' }}
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #374151', background: '#374151', color: 'white' }}
        />
        <button type="submit" style={{ padding: '0.75rem', borderRadius: '4px', border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
          Login
        </button>
      </form>
    </div>
  );
}
