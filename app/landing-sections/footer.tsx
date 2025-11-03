export default function Footer() {
    return (
        <footer className="border-t border-border bg-white py-6">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex w-full items-start justify-between">
                    <div className="w-full max-w-[25%] text-left">
                        <h3 className="mb-2 text-xl font-bold">GetRedditUserFast</h3>
                        <p className="text-sm text-muted-foreground">
                            Find desperate users on Reddit in seconds. Connect with users who already need and want your product.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">For inquiries:</p>
                        <p className="text-sm">
                            <a href="mailto:leehuanyoei2025@gmail.com" className="text-primary hover:underline">leehuanyoei2025@gmail.com</a>
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    )
}

