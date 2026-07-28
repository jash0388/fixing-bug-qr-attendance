#include <stdio.h>
#include <math.h>
int main() {
    int n,t,d,c=0,s=0;
    printf("Enter number: ");
    scanf("%d",&n);
    t=n;
    while(t){c++; t/=10;}
    t=n;
    while(t){
        d=t%10;
        s+=pow(d,c);
        t/=10;
    }
    if(s==n)
        printf("Armstrong Number");
    else
        printf("Not Armstrong Number");
    return 0;
}
