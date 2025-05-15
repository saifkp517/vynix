'use client'
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

const Waitlist = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Placeholder for backend API call
    // Example: await fetch('/api/waitlist', { method: 'POST', body: JSON.stringify({ email }) })
    try {
      // Simulate API call
      setTimeout(() => {
        setMessage('Thanks for joining the waitlist!');
        setEmail('');
      }, 500);
    } catch (error) {
      setMessage('Something went wrong. Try again!');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="bg-gray-800 border-gray-700 shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center text-white">
              Join [Your Game Name] Waitlist
            </CardTitle>
            <p className="text-center text-gray-300 mt-2">
              Get exclusive updates and early access to our epic game!
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter your email"
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
              >
                Join Waitlist
              </Button>
            </form>
            {message && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`mt-4 text-center text-sm ${
                  message.includes('Thanks') ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {message}
              </motion.p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Waitlist;