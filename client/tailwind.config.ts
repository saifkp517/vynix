
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Cyberpunk color palette
        'cyber-black': '#0d0d0d',
        'cyber-blue': {
          DEFAULT: '#00f0ff',
          dark: '#00a2ad',
          light: '#7df9ff',
        },
        'cyber-pink': {
          DEFAULT: '#ff003c',
          dark: '#c60030',
          light: '#ff6b9c',
        },
        'cyber-yellow': {
          DEFAULT: '#ffdf00',
          dark: '#ccb200',
          light: '#fff06b',
        },
        'cyber-purple': {
          DEFAULT: '#bf00ff',
          dark: '#8f00bd',
          light: '#df80ff',
        },
        'cyber-green': {
          DEFAULT: '#00ff66',
          dark: '#00bd4d',
          light: '#80ffb3',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        'cyber': ['Share Tech Mono', 'monospace'],
        'display': ['Orbitron', 'sans-serif'],
        'body': ['Rajdhani', 'sans-serif'],
      },
      boxShadow: {
        'cyber': '0 0 10px rgba(0, 240, 255, 0.5), 0 0 20px rgba(0, 240, 255, 0.3), 0 0 30px rgba(0, 240, 255, 0.1)',
        'cyber-pink': '0 0 10px rgba(255, 0, 60, 0.5), 0 0 20px rgba(255, 0, 60, 0.3), 0 0 30px rgba(255, 0, 60, 0.1)',
        'cyber-yellow': '0 0 10px rgba(255, 223, 0, 0.5), 0 0 20px rgba(255, 223, 0, 0.3), 0 0 30px rgba(255, 223, 0, 0.1)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "cyber-glitch": {
          "0%, 100%": { transform: "translate(0)" },
          "10%": { transform: "translate(-5px, 0)" },
          "20%": { transform: "translate(5px, 0)" },
          "30%": { transform: "translate(0, 0)" },
          "40%": { transform: "translate(5px, 0)" },
          "50%": { transform: "translate(-5px, 0)" },
          "60%": { transform: "translate(0, 0)" },
        },
        "neon-pulse": {
          "0%, 100%": {
            opacity: 1,
            filter: "brightness(1)",
          },
          "50%": {
            opacity: 0.8,
            filter: "brightness(1.2)",
          },
        },
        "scanline": {
          "0%": { top: "0%" },
          "100%": { top: "100%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "cyber-glitch": "cyber-glitch 0.5s ease-in-out infinite",
        "neon-pulse": "neon-pulse 2s ease-in-out infinite",
        "scanline": "scanline 8s linear infinite",
      },
      backgroundImage: {
        'cyber-grid': 'linear-gradient(rgba(0, 240, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.1) 1px, transparent 1px)',
        'cyber-grid-small': 'linear-gradient(rgba(0, 240, 255, 0.1) 0.5px, transparent 0.5px), linear-gradient(90deg, rgba(0, 240, 255, 0.1) 0.5px, transparent 0.5px)',
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
};
