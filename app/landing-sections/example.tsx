import { CheckCircle2, Shield, Users, Zap } from "lucide-react";

export default function Examples() {
    return (
        <section className="py-20">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
                <div className="mb-12 text-center">
                    <h2 className="mb-4 text-3xl font-bold sm:text-4xl">See It In Action</h2>
                    <p className="mx-auto max-w-2xl text-muted-foreground">
                        Discover how others are using our platform to transform their workflow.
                    </p>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        {
                            title: "Example One",
                            description: "Streamline your workflow with our powerful automation tools.",
                            icon: Zap,
                        },
                        {
                            title: "Example Two",
                            description: "Collaborate seamlessly with your team in real-time.",
                            icon: Users,
                        },
                        {
                            title: "Example Three",
                            description: "Keep your data secure with enterprise-grade encryption.",
                            icon: Shield,
                        },
                    ].map((example, index) => (
                        <div
                            key={index}
                            className="group rounded-lg border border-border bg-card p-6 transition-all hover:border-primary hover:shadow-md"
                        >
                            <div className="mb-4 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10">
                                <example.icon className="size-6 text-primary" />
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