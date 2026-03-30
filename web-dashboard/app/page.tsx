"use client"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LandingSidebar } from "@/components/landing-sidebar"
import { LandingNav } from "@/components/landing-nav"
import ScrollSequence from "@/components/landing/scroll-sequence"
import { HeroSection } from "@/components/landing/hero-section"
import { TimelineSection } from "@/components/landing/timeline-section"
import { FeaturesSection } from "@/components/landing/features-section"
import { TechSection } from "@/components/landing/tech-section"
import Image from "next/image"
import Link from "next/link"
import { ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function LandingPage() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="dark min-h-screen">
      <div className="absolute inset-0 bg-gradient-to-b from-brand-navy/50 to-background" />
      <ScrollSequence frameCount={192} />

      <SidebarProvider defaultOpen={true} className="bg-transparent">
        <LandingSidebar />
        <SidebarInset className="bg-transparent">
          <LandingNav />

          {/* Main Content */}
          <main>
            <div className="bg-black/40 backdrop-blur-md">
              <section id="hero" className="min-h-screen flex flex-col justify-center">
                <HeroSection />
              </section>
              <section id="timeline" className="min-h-screen flex flex-col justify-center">
                <TimelineSection />
              </section>
              <section id="features" className="min-h-screen flex flex-col justify-center">
                <FeaturesSection />
              </section>
              <section id="tech" className="min-h-screen flex flex-col justify-center">
                <TechSection />
              </section>
            </div>
          </main>

          {/* Footer */}
          <footer className="bg-black/60 backdrop-blur-md text-foreground py-12 px-6">
            <div className="max-w-6xl mx-auto">
              <div className="grid md:grid-cols-4 gap-8 mb-8">
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <Image
                      src="/icon.png"
                      alt="ETF Trading Logo"
                      width={32}
                      height={32}
                      className="object-contain"
                    />
                    <span className="font-semibold">Snowballing AI ETF</span>
                  </div>
                  <p className="text-muted-foreground text-sm max-w-md">
                    AI 기반 수익률 예측과 규제 대응 설계를 완료한 차세대 Active ETF 솔루션입니다.
                    데이터가 증명하는 투명한 운용을 약속합니다.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-4">서비스</h4>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      <Link href="/dashboard" className="hover:text-brand-primary">
                        대시보드
                      </Link>
                    </li>
                    <li>
                      <Link href="/predictions" className="hover:text-brand-primary">
                        예측 결과
                      </Link>
                    </li>
                    <li>
                      <Link href="/portfolio" className="hover:text-brand-primary">
                        포트폴리오
                      </Link>
                    </li>
                    <li>
                      <Link href="/trading" className="hover:text-brand-primary">
                        자동매매
                      </Link>
                    </li>
                    <li>
                      <Link href="/factsheet" className="hover:text-brand-primary">
                        팩트시트
                      </Link>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-4">정보</h4>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      <Link href="/returns" className="hover:text-brand-primary">
                        수익률 분석
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-muted-foreground text-sm">
                  &copy; 2025 Snowballing AI ETF. All rights reserved.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={scrollToTop}
                  className="text-muted-foreground hover:text-brand-primary"
                >
                  <ArrowUp className="w-4 h-4 mr-2" />
                  맨 위로
                </Button>
              </div>
            </div>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
