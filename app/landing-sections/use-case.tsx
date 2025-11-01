import { CheckCircle2 } from "lucide-react";

export default function UseCase() {
    return (
        <section className="border-t border-border bg-muted/30 py-20">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
                <div className="mb-12 text-center">
                    <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Perfect For</h2>
                    <p className="mx-auto max-w-2xl text-muted-foreground">
                        Whether you're a startup or enterprise, we have the solution for you.
                    </p>
                </div>
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {[
                        {
                            title: "Startups",
                            description:
                                "Launch faster with our intuitive tools. Perfect for teams that need to move quickly and iterate.",
                            features: ["Fast setup", "Flexible pricing", "Scales with you"],
                        },
                        {
                            title: "Enterprise",
                            description:
                                "Powerful features for large organizations. Advanced security, compliance, and dedicated support.",
                            features: ["Advanced security", "SSO integration", "Dedicated support"],
                        },
                        {
                            title: "Developers",
                            description:
                                "Built by developers, for developers. Extensive API, webhooks, and developer-friendly documentation.",
                            features: ["RESTful API", "Webhooks", "Comprehensive docs"],
                        },
                        {
                            title: "Design Teams",
                            description:
                                "Collaborate seamlessly on designs. Real-time editing, version control, and asset management.",
                            features: ["Real-time collaboration", "Version control", "Asset library"],
                        },
                        {
                            title: "Marketing Teams",
                            description:
                                "Create campaigns, track performance, and analyze results all in one place.",
                            features: ["Campaign builder", "Analytics dashboard", "A/B testing"],
                        },
                        {
                            title: "Remote Teams",
                            description:
                                "Stay connected and productive no matter where your team is located.",
                            features: ["Video conferencing", "Async communication", "Time zone tools"],
                        },
                    ].map((useCase, index) => (
                        <div
                            key={index}
                            className="rounded-lg border border-border bg-card p-8"
                        >
                            <h3 className="mb-3 text-2xl font-semibold">{useCase.title}</h3>
                            <p className="mb-6 text-muted-foreground">{useCase.description}</p>
                            <ul className="space-y-2">
                                {useCase.features.map((feature, featureIndex) => (
                                    <li key={featureIndex} className="flex items-center gap-2">
                                        <CheckCircle2 className="size-4 text-primary" />
                                        <span className="text-sm">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </section>

    )
}