import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function FooterCTA() {
    return (
        <section className="border-t border-border py-20">
            <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
                <h2 className="mb-4 text-2xl font-bold sm:text-4xl">Ready to Get Started?</h2>
                <p className="mb-8 text-lg text-muted-foreground">
                    Join thousands of teams already using our platform.
                </p>
                <Button size="lg" className="text-base">
                    Start Free Trial
                    <ArrowRight className="ml-2 size-4" />
                </Button>
            </div>
        </section>
    )
}