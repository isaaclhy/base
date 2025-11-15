import { MessageSquare, Lightbulb, Rocket } from "lucide-react";

export default function Examples() {
    return (
        <section className="pb-20 pt-8">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
                <div className="space-y-3 text-center mb-12">
                    <h2 className="text-3xl font-bold sm:text-4xl">See It In Action</h2>
                    <p className="mx-auto max-w-2xl text-muted-foreground">
                        Discover how others are using our platform to transform their workflow.
                    </p>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        {
                            title: "Add a post",
                            description: "Enter a Reddit post link to generate comments for it. We'll handle the rest.",
                            icon: MessageSquare,
                        },
                        {
                            title: "Enter your idea",
                            description: "Provide detailed information about your product or startup for better results.",
                            icon: Lightbulb,
                        },
                        {
                            title: "Get users now",
                            description: "Receive natural-sounding comments ready to use immediately. No waiting.",
                            icon: Rocket,
                        },
                    ].map((example, index) => (
                        <div
                            key={index}
                            className="group rounded-lg border bg-card p-6 transition-all hover:shadow-md"
                            style={{
                                borderColor: 'var(--border)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'oklch(0.65 0.22 30)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                            }}
                        >
                            <div 
                                className="mb-4 inline-flex size-12 items-center justify-center rounded-lg"
                                style={{ backgroundColor: 'oklch(0.65 0.22 30 / 0.1)' }}
                            >
                                <example.icon 
                                    className="size-6" 
                                    style={{ color: 'oklch(0.65 0.22 30)' }}
                                />
                            </div>
                            <h3 className="mb-2 text-xl font-semibold">{example.title}</h3>
                            <p className="text-muted-foreground">{example.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>

    )
}