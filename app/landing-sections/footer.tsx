export default function Footer() {
    return (
        <footer className="border-t border-border bg-white py-6">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="w-full max-w-full sm:max-w-[25%] text-left">
                        <h3 className="mb-2 text-lg sm:text-xl font-bold">SignalScouter</h3>
                        <p className="text-sm text-muted-foreground">
                            Find desperate users on Reddit in seconds. Connect with users who already need and want your product.
                        </p>
                    </div>
                    <div className="text-left sm:text-right">
                        <p className="text-sm text-muted-foreground">For inquiries:</p>
                        <p className="text-sm break-all sm:break-normal">
                            <a href="mailto:leehuanyoei2025@gmail.com" className="text-primary hover:underline">leehuanyoei2025@gmail.com</a>
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    )
}

