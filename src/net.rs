use std::net::{IpAddr, Ipv4Addr};

pub fn is_private_ipv4(v4: &Ipv4Addr) -> bool {
    let o = v4.octets();
    o[0] == 10
        || (o[0] == 172 && (16..=31).contains(&o[1]))
        || (o[0] == 192 && o[1] == 168)
}

/// Best guess IPv4 for LAN access (Wi‑Fi), skipping loopback and link-local.
pub fn pick_lan_ipv4() -> Option<String> {
    let ifaces = local_ip_address::list_afinet_netifas().ok()?;
    let mut candidates: Vec<Ipv4Addr> = Vec::new();
    for (_name, ip) in ifaces {
        if let IpAddr::V4(v4) = ip {
            if v4.is_loopback() || v4.is_unspecified() || v4.is_link_local() {
                continue;
            }
            if is_private_ipv4(&v4) {
                candidates.push(v4);
            }
        }
    }
    candidates.sort_by_key(|v4| {
        let o = v4.octets();
        if o[0] == 192 && o[1] == 168 {
            0
        } else if o[0] == 10 {
            1
        } else {
            2
        }
    });
    candidates
        .first()
        .map(|v4| v4.to_string())
        .or_else(|| match local_ip_address::local_ip().ok() {
            Some(IpAddr::V4(v4)) if !v4.is_loopback() => Some(v4.to_string()),
            _ => None,
        })
}

pub fn normalize_base(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return String::from("http://localhost/");
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    format!("{}/", with_scheme.trim_end_matches('/'))
}

pub fn ui_url(host: &str, port: u16) -> String {
    format!("http://{host}:{port}/")
}

pub fn print_lan_hints(port: u16, selected: &str) {
    println!("\nLAN: open http://{selected}:{port}/ on phones/tablets (same Wi‑Fi).");
    println!("Do NOT use localhost or 127.0.0.1 on other devices.");
    if let Ok(ifaces) = local_ip_address::list_afinet_netifas() {
        println!("Detected interfaces:");
        for (name, ip) in ifaces {
            if let IpAddr::V4(v4) = ip {
                if !v4.is_loopback() {
                    println!("  {name}: {v4}");
                }
            }
        }
    }
    println!("If QR opens a wrong page, run with: --public-url http://<Wi-Fi-IP>:{port}/");
}
