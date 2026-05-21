export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#1A1A2E" }}
    >
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        {/* Logo */}
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center mb-8 shadow-2xl"
          style={{
            backgroundColor: "#6C63FF",
            boxShadow: "0 0 60px rgba(108, 99, 255, 0.4)",
          }}
        >
          <span className="text-white font-bold text-6xl select-none">Q</span>
        </div>

        {/* Heading */}
        <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-4 tracking-tight">
          Welcome to{" "}
          <span style={{ color: "#6C63FF" }}>Quare</span>
        </h1>

        {/* Tagline */}
        <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-xl">
          The future of tokenized finance
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#"
            className="px-8 py-4 rounded-xl font-semibold text-white text-lg transition-all duration-200 hover:opacity-90 hover:scale-105"
            style={{ backgroundColor: "#6C63FF" }}
          >
            Get Started
          </a>
          <a
            href="#"
            className="px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:opacity-90 hover:scale-105"
            style={{
              backgroundColor: "transparent",
              border: "2px solid #6C63FF",
              color: "#6C63FF",
            }}
          >
            Learn More
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} Quare. All rights reserved.
      </footer>
    </main>
  );
}
