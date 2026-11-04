param([switch]$Once, [switch]$Diagnostics)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CoCoTaskbarProbe {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int Size; public RECT Monitor, Work; public int Flags; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT rect, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder name, int size);
  public static IntPtr Bar() { return FindWindow("Shell_TrayWnd",null); }
  public static IntPtr Child(IntPtr parent, IntPtr after, string cls) { return FindWindowEx(parent,after,cls,null); }
  public static bool Exposed(IntPtr bar) {
    var info=new MONITORINFO(); info.Size=Marshal.SizeOf(info);
    if (!GetMonitorInfo(MonitorFromWindow(bar,2),ref info)) return false;
    var r=Rect(bar); var m=info.Monitor;
    return r.Left>=m.Left-1 && r.Top>=m.Top-1 && r.Right<=m.Right+1 && r.Bottom<=m.Bottom+1;
  }
  public static RECT Rect(IntPtr hwnd) { RECT r; GetWindowRect(hwnd, out r); return r; }
  public static bool SameOwner(IntPtr a, IntPtr b) { uint x,y; GetWindowThreadProcessId(a,out x); GetWindowThreadProcessId(b,out y); return x!=0 && x==y; }
  public static bool Fullscreen(IntPtr bar) {
    var foreground=GetForegroundWindow();
    // A maximized app with an extended invisible frame can cover the monitor
    // rectangle while the taskbar remains visible. It is not fullscreen.
    if (foreground==IntPtr.Zero || SameOwner(bar,foreground) || !IsWindowVisible(foreground) || IsZoomed(foreground) || IsIconic(foreground)) return false;
    var info=new MONITORINFO(); info.Size=Marshal.SizeOf(info);
    if (!GetMonitorInfo(MonitorFromWindow(bar,2),ref info)) return false;
    RECT r; if (DwmGetWindowAttribute(foreground,9,out r,Marshal.SizeOf(typeof(RECT)))!=0) r=Rect(foreground);
    var m=info.Monitor;
    return r.Left<=m.Left && r.Top<=m.Top && r.Right>=m.Right && r.Bottom>=m.Bottom;
  }
}
'@
try { [void][CoCoTaskbarProbe]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch {}
function Rect-Object($rect) {
  return @{ x=[int]$rect.Left; y=[int]$rect.Top; width=[int]($rect.Right-$rect.Left); height=[int]($rect.Bottom-$rect.Top) }
}
do {
  $fallback=$null
  try {
    $bar = [CoCoTaskbarProbe]::Bar()
    if ($bar -eq [IntPtr]::Zero -or -not [CoCoTaskbarProbe]::SameOwner($bar,[CoCoTaskbarProbe]::GetShellWindow())) { throw 'Taskbar unavailable' }
    $bounds = Rect-Object ([CoCoTaskbarProbe]::Rect($bar))
    $dark=$true
    try { $dark=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize').SystemUsesLightTheme -ne 1 } catch {}
    $centered=$true
    try { $centered=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced').TaskbarAl -ne 0 } catch {}
    $fallback=@{available=$false;transient=$true;bar=$bounds;scale=[Math]::Max(1,[CoCoTaskbarProbe]::GetDpiForWindow($bar)/96.0);dark=$dark;centered=$centered;visible=([CoCoTaskbarProbe]::IsWindowVisible($bar) -and [CoCoTaskbarProbe]::Exposed($bar));fullscreen=[CoCoTaskbarProbe]::Fullscreen($bar);foreground=[CoCoTaskbarProbe]::GetForegroundWindow().ToInt64().ToString()}
    if ($Diagnostics) {
      $child=[CoCoTaskbarProbe]::GetWindow($bar,5)
      while ($child -ne [IntPtr]::Zero) {
        $name=New-Object System.Text.StringBuilder 256
        [void][CoCoTaskbarProbe]::GetClassName($child,$name,256)
        [Console]::Error.WriteLine("Child: $($name.ToString()); handle: $child")
        $child=[CoCoTaskbarProbe]::GetWindow($child,2)
      }
    }
    $occupied = New-Object System.Collections.ArrayList
    $contentStart = [double]::PositiveInfinity
    $contentEnd = [double]::NegativeInfinity
    # Query only Explorer's XAML/rebar subtree. Never enumerate Chromium child
    # windows embedded by other applications in Shell_TrayWnd.
    $bridges=New-Object System.Collections.ArrayList
    $previous=[IntPtr]::Zero
    while ($true) {
      $bridge=[CoCoTaskbarProbe]::Child($bar,$previous,'Windows.UI.Composition.DesktopWindowContentBridge')
      if ($bridge -eq [IntPtr]::Zero) { break }
      [void]$bridges.Add($bridge); $previous=$bridge
    }
    if ($bridges.Count -eq 0) {
      $bridge=[CoCoTaskbarProbe]::Child($bar,[IntPtr]::Zero,'ReBarWindow32')
      if ($bridge -ne [IntPtr]::Zero) { [void]$bridges.Add($bridge) }
    }
    if ($bridges.Count -eq 0) { throw 'Taskbar content unavailable' }
    $elements=New-Object System.Collections.ArrayList
    foreach ($bridge in $bridges) {
      $root=[System.Windows.Automation.AutomationElement]::FromHandle($bridge)
      $nodes=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
      if ($nodes.Count -gt 2048) { throw 'Incomplete taskbar scan' }
      foreach ($node in $nodes) { [void]$elements.Add($node) }
      if ($Diagnostics) { [Console]::Error.WriteLine("Bridge: $bridge; elements: $($nodes.Count)") }
    }
    $hasStart=$false
    foreach ($element in $elements) {
      $current = $element.Current
      if ($current.IsOffscreen) { continue }
      $rect = $current.BoundingRectangle
      $id = $current.AutomationId
      $button = $current.ControlType.Id -in @(50000,50002,50004,50007,50011,50019)
      $content = $current.ClassName -match 'TaskListButton' -or $id -match 'TaskList|StartButton|SearchButton|SearchBox|TaskView'
      if ($id -eq 'StartButton') { $hasStart=$true }
      if (-not $button -and -not $content -and $id -notmatch 'Widgets|SystemTray|Notification|Clock') { continue }
      if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0 -or $rect.Width -gt $bounds.width*0.85) { continue }
      if ($rect.Y -ge $bounds.y+$bounds.height -or $rect.Bottom -le $bounds.y) { continue }
      $item = @{x=[int][Math]::Floor($rect.X); y=[int][Math]::Floor($rect.Y); width=[int][Math]::Ceiling($rect.Width); height=[int][Math]::Ceiling($rect.Height)}
      [void]$occupied.Add($item)
      if ($content -or ($button -and $id -notmatch 'SystemTray|Widgets|Notification|Clock|Chevron|ShowDesktop|Copilot')) {
        $contentStart = [Math]::Min($contentStart,$rect.X)
        $contentEnd = [Math]::Max($contentEnd,$rect.Right)
      }
    }
    # Native notification area and start button on Windows 10.
    foreach ($cls in @('TrayNotifyWnd','Start')) {
      $child=[CoCoTaskbarProbe]::Child($bar,[IntPtr]::Zero,$cls)
      if ($child -ne [IntPtr]::Zero -and [CoCoTaskbarProbe]::IsWindowVisible($child)) {
        $native=Rect-Object ([CoCoTaskbarProbe]::Rect($child))
        [void]$occupied.Add($native)
        if ($cls -eq 'Start') { $hasStart=$true; $contentStart=[Math]::Min($contentStart,$native.x); $contentEnd=[Math]::Max($contentEnd,$native.x+$native.width) }
      }
    }
    $available = $hasStart -and -not [double]::IsInfinity($contentStart) -and $bounds.width -gt $bounds.height -and [CoCoTaskbarProbe]::Exposed($bar)
    $packet=@{}+$fallback
    $packet.available=$available
    $packet.occupied=@($occupied)
    $packet.content=@{start=$contentStart;end=$contentEnd}
    if (-not $available) { $packet.content=@{start=0;end=0} }
    [Console]::WriteLine(($packet | ConvertTo-Json -Depth 5 -Compress))
  } catch {
    if ($Once) { [Console]::Error.WriteLine($_.Exception.Message) }
    if ($fallback) { [Console]::WriteLine(($fallback | ConvertTo-Json -Depth 5 -Compress)) }
    else { [Console]::WriteLine('{"available":false}') }
  }
  if (-not $Once) { Start-Sleep -Milliseconds 700 }
} while (-not $Once)
