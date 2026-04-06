"use client"

import Image from "next/image"

import {
  Bot,
  Briefcase,
  FileText,
  Home,
  LineChart,
  TrendingUp,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const menuItems = [
  {
    title: "대시보드",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "예측 결과",
    url: "/predictions",
    icon: LineChart,
  },
  {
    title: "포트폴리오",
    url: "/portfolio",
    icon: Briefcase,
  },
  {
    title: "자동매매",
    url: "/trading",
    icon: Zap,
  },
  {
    title: "수익률 분석",
    url: "/returns",
    icon: TrendingUp,
  },
  {
    title: "팩트시트",
    url: "/factsheet",
    icon: FileText,
  },
  {
    title: "멀티AI",
    url: "/multi-ai",
    icon: Bot,
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          {/* <BarChart3 className="h-6 w-6 text-primary" /> */}
          <div className="relative h-8 w-8">
            <Image
              src="/icon.png"
              alt="ETF Trading Logo"
              fill
              className="object-contain"
            />
          </div>
          <span className="font-semibold text-lg">Snowballing AI ETF</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={pathname === item.url || (item.url === "/dashboard" && pathname === "/")}
                    className="data-[active=true]:bg-brand-primary/15 data-[active=true]:text-brand-navy dark:data-[active=true]:text-brand-primary data-[active=true]:font-bold touch-manipulation"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
