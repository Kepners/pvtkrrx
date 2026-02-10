import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-surface/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg"></div>
              <span className="text-xl font-bold text-primary">PVTKRRX</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#features" className="text-gray-700 hover:text-primary transition">Features</a>
              <a href="#pricing" className="text-gray-700 hover:text-primary transition">Pricing</a>
              <a href="#faq" className="text-gray-700 hover:text-primary transition">FAQ</a>
              <Link href="/login" className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition">
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section — 5-SECOND TEST */}
      <section className="pt-20 pb-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Stream From Your Seedbox<br />to Stremio
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Turn your private tracker downloads into a personal Stremio catalog. £1/month.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="px-8 py-4 bg-primary text-white text-lg font-semibold rounded-xl hover:opacity-90 transition shadow-lg"
            >
              Start Free Trial
            </Link>
            <a
              href="#features"
              className="px-8 py-4 bg-surface text-primary text-lg font-semibold rounded-xl hover:bg-accent/30 transition border-2 border-primary"
            >
              See How It Works
            </a>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            No credit card required • 7-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* Social Proof */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-surface rounded-2xl p-8 text-center border border-gray-200">
            <p className="text-gray-600 mb-4 text-lg">
              "Finally, my 4K remuxes from private trackers work perfectly in Stremio. Worth every penny."
            </p>
            <p className="text-sm text-gray-500">— James M., Ultra.cc user</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-surface/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">
            Everything You Need
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="⚡"
              title="Instant Streaming"
              description="Already on your seedbox? Stream starts immediately. Not downloaded yet? We trigger the download and poll until ready."
            />
            <FeatureCard
              icon="🏆"
              title="Private Tracker Quality"
              description="4K BluRay remuxes, Dolby Atmos, HDR10+. Your private tracker content, your Stremio library."
            />
            <FeatureCard
              icon="🔒"
              title="Your Infrastructure"
              description="You provide your own seedbox. We just connect it to Stremio. Zero storage costs for us, full control for you."
            />
            <FeatureCard
              icon="🎬"
              title="Sports, Movies, TV"
              description="4 catalogs: Sports (with genre filters), Movies, TV Shows, and your Library of completed downloads."
            />
            <FeatureCard
              icon="📱"
              title="Works Everywhere"
              description="Stremio on desktop, mobile, TV, web. PVTKRRX works on all platforms with zero config changes."
            />
            <FeatureCard
              icon="🚀"
              title="60-Second Setup"
              description="Enter your Jackett + qBittorrent credentials, test connection, install in Stremio. Done."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6 text-gray-900">Simple Pricing</h2>
          <p className="text-xl text-gray-600 mb-12">One plan. No hidden fees. Cancel anytime.</p>

          <div className="bg-surface rounded-2xl p-12 border-2 border-primary shadow-xl max-w-md mx-auto">
            <div className="mb-6">
              <p className="text-gray-600 text-sm uppercase tracking-wide font-semibold mb-2">Monthly</p>
              <p className="text-6xl font-bold text-primary mb-2">£1</p>
              <p className="text-gray-500">per month</p>
            </div>
            <ul className="text-left space-y-3 mb-8">
              <PricingFeature text="Unlimited streams" />
              <PricingFeature text="All 4 catalogs (Sports, Movies, TV, Library)" />
              <PricingFeature text="Genre filtering for sports" />
              <PricingFeature text="Instant playback from seedbox" />
              <PricingFeature text="Comet download triggering" />
              <PricingFeature text="Cancel anytime, no questions" />
            </ul>
            <Link
              href="/signup"
              className="block w-full px-8 py-4 bg-primary text-white text-lg font-semibold rounded-xl hover:opacity-90 transition"
            >
              Start 7-Day Free Trial
            </Link>
            <p className="mt-4 text-sm text-gray-500">No credit card required for trial</p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4 bg-surface/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-gray-900">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <FAQItem
              question="Do I need my own seedbox?"
              answer="Yes. PVTKRRX is a bridge between your existing seedbox (with Jackett + qBittorrent) and Stremio. You provide the infrastructure, we provide the addon. This keeps our costs near zero and gives you full control."
            />
            <FAQItem
              question="What if I don't have a seedbox yet?"
              answer="You'll need one to use PVTKRRX. We recommend Ultra.cc, Feral Hosting, or Whatbox. Most plans start around $5-10/month and include Jackett + qBittorrent pre-installed."
            />
            <FAQItem
              question="How does the 7-day free trial work?"
              answer="Sign up, configure your seedbox, and use PVTKRRX completely free for 7 days. No credit card required. After 7 days, you'll be asked to subscribe at £1/month to continue."
            />
            <FAQItem
              question="Can I cancel anytime?"
              answer="Absolutely. Cancel from your account dashboard with one click. No questions asked, no fees. Your access continues until the end of your billing period."
            />
            <FAQItem
              question="What private trackers does this work with?"
              answer="Any tracker supported by Jackett or Prowlarr. This includes all major private trackers for movies, TV, and sports. Your Jackett setup determines what content you can access."
            />
            <FAQItem
              question="Is my seedbox username/password safe?"
              answer="Yes. Your credentials are encrypted with AES-256-GCM and stored only in your browser's config token. We never store your seedbox credentials on our servers. Every request decrypts your config on-demand."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center bg-primary rounded-2xl p-12 text-white">
          <h2 className="text-4xl font-bold mb-4">Ready to Stream?</h2>
          <p className="text-xl mb-8 opacity-90">
            Start your 7-day free trial. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-block px-8 py-4 bg-white text-primary text-lg font-semibold rounded-xl hover:bg-accent transition"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 px-4 bg-surface">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg"></div>
                <span className="text-lg font-bold text-primary">PVTKRRX</span>
              </div>
              <p className="text-sm text-gray-600">Stream from your seedbox to Stremio.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="text-gray-600 hover:text-primary">Features</a></li>
                <li><a href="#pricing" className="text-gray-600 hover:text-primary">Pricing</a></li>
                <li><Link href="/signup" className="text-gray-600 hover:text-primary">Sign Up</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#faq" className="text-gray-600 hover:text-primary">FAQ</a></li>
                <li><Link href="/docs" className="text-gray-600 hover:text-primary">Documentation</Link></li>
                <li><a href="mailto:support@pvtkrrx.com" className="text-gray-600 hover:text-primary">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy" className="text-gray-600 hover:text-primary">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-gray-600 hover:text-primary">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
            © 2026 PVTKRRX. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 hover:border-primary transition">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2 text-gray-900">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

function PricingFeature({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      <span className="text-gray-700">{text}</span>
    </li>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <h3 className="text-lg font-semibold mb-2 text-gray-900">{question}</h3>
      <p className="text-gray-600">{answer}</p>
    </div>
  )
}
