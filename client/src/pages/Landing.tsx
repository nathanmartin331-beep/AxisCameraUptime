import { Button } from "@/components/ui/button";
import { Camera, TrendingUp, Shield, BarChart3 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-primary/10 rounded-full">
              <Camera className="w-16 h-16 text-primary" />
            </div>
          </div>
          
          <h1 className="text-5xl font-bold mb-6">
            Camera Uptime Monitor
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8">
            Enterprise-grade monitoring for Axis security cameras. 
            Track uptime, detect reboots, and maintain 365 days of historical data.
          </p>
          
          <Button
            size="lg"
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-login"
            className="text-lg px-8 py-6"
          >
            Sign In to Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center p-6">
            <div className="inline-flex p-3 bg-primary/10 rounded-lg mb-4">
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Real-Time Monitoring</h3>
            <p className="text-muted-foreground">
              Continuous polling of 300+ cameras every 5 minutes using VAPIX API
            </p>
          </div>

          <div className="text-center p-6">
            <div className="inline-flex p-3 bg-primary/10 rounded-lg mb-4">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Historical Analytics</h3>
            <p className="text-muted-foreground">
              365-day data retention with uptime graphs and reboot detection
            </p>
          </div>

          <div className="text-center p-6">
            <div className="inline-flex p-3 bg-primary/10 rounded-lg mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Secure Credentials</h3>
            <p className="text-muted-foreground">
              Encrypted storage of camera credentials with user authentication
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
